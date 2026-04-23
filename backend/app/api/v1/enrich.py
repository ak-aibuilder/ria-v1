from datetime import datetime, timezone
from threading import Lock

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, get_current_user
from app.db.mongo import get_db
from app.services.audit import score_product
from app.services.claude import ClaudeEnrichmentClient, EnrichmentError
from app.services.enrich import enrich_products, _apply_enriched_view

router = APIRouter(prefix="/enrich", tags=["enrich"])

# In-process progress tracker keyed by session_id. Survives until the worker
# restarts — fine for a demo. Polled by the frontend while a run is in flight.
_progress: dict[str, dict] = {}
_progress_lock = Lock()


def _set_progress(session_id: str, **fields) -> None:
    with _progress_lock:
        cur = _progress.setdefault(session_id, {})
        cur.update(fields)


class EnrichRunRequest(BaseModel):
    include_reviews: bool = False  # PDF: D4 opt-in only


def _strip_db_id(doc: dict) -> dict:
    out = dict(doc)
    out.pop("_id", None)
    out.pop("session_id", None)
    out.pop("created_at", None)
    out.pop("updated_at", None)
    return out


@router.post("/run")
async def run_enrichment(
    payload: EnrichRunRequest = Body(default_factory=EnrichRunRequest),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    products_cursor = db.products.find({"session_id": user.session_id})
    products = [p async for p in products_cursor]
    if not products:
        raise HTTPException(status_code=409, detail="upload a catalog before enriching")
    if not any(p.get("score") for p in products):
        raise HTTPException(status_code=409, detail="run the audit before enriching")

    try:
        client = ClaudeEnrichmentClient()
    except EnrichmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _set_progress(
        user.session_id,
        total=len(products),
        completed=0,
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
    )

    def _on_done(_sku: str) -> None:
        with _progress_lock:
            cur = _progress.setdefault(user.session_id, {})
            cur["completed"] = int(cur.get("completed", 0)) + 1

    try:
        enriched = await enrich_products(
            products, client=client, on_product_done=_on_done
        )
    except Exception:
        _set_progress(user.session_id, status="error")
        raise

    now = datetime.now(timezone.utc)
    for prod in enriched:
        await db.products.update_one(
            {"_id": prod["_id"]},
            {
                "$set": {
                    "enriched": prod.get("enriched"),
                    "enriched_provenance": prod.get("enriched_provenance", {}),
                    "audit_trail": prod.get("audit_trail", []),
                    "score": prod.get("score"),
                    "enrichment_status": prod.get("enrichment_status", "ok"),
                    "updated_at": now,
                }
            },
        )
    await db.sessions.update_one(
        {"_id": user.session_id},
        {"$set": {"phase": "enrich", "last_activity": now}},
    )
    _set_progress(user.session_id, status="done", completed=len(enriched))

    return {
        "enriched_products": [
            {
                "sku": p["sku"],
                "original_fields": {
                    "name": p.get("name"),
                    "description": p.get("description"),
                    "price": p.get("price"),
                    "category": p.get("category"),
                    "brand": p.get("brand"),
                    "image_urls": p.get("image_urls"),
                    "attributes": p.get("attributes"),
                },
                "enriched_fields": p.get("enriched") or {},
                "provenance_metadata": {"source": "ria_enriched"},
                "confidence_scores": {
                    k: v.get("confidence", 0.0)
                    for k, v in (p.get("enriched_provenance") or {}).items()
                },
                "enrichment_status": p.get("enrichment_status", "ok"),
                "audit_trail": p.get("audit_trail", []),
            }
            for p in enriched
        ],
        "scored_products": [
            {"sku": p["sku"], **(p.get("score") or {})} for p in enriched if p.get("score")
        ],
        "report": {
            "succeeded": sum(1 for p in enriched if p.get("enrichment_status") == "ok"),
            "failed": sum(1 for p in enriched if p.get("enrichment_status") == "failed"),
        },
    }


@router.get("/progress")
async def get_progress(user: CurrentUser = Depends(get_current_user)) -> dict:
    with _progress_lock:
        snapshot = dict(_progress.get(user.session_id, {}))
    return {
        "total": snapshot.get("total", 0),
        "completed": snapshot.get("completed", 0),
        "status": snapshot.get("status", "idle"),
    }


class PatchEnrichedRequest(BaseModel):
    # D1 source-of-truth fields (user override — bypasses Claude per PDF §3.3)
    name: str | None = None
    price: float | None = None
    category: str | None = None
    brand: str | None = None
    image_urls: list[str] | None = None
    attributes: dict | None = None
    # D2 / D3 / D5 / D6 enriched fields
    description: str | None = None
    q_and_a: list[dict] | None = None
    agent_facets: dict | None = None
    relationship_type: list[dict] | None = None


SOURCE_FIELDS = {"name", "price", "category", "brand", "image_urls", "attributes"}
ENRICHED_FIELDS = {"description", "q_and_a", "agent_facets", "relationship_type"}


@router.patch("/{sku}")
async def patch_enriched(
    sku: str,
    payload: PatchEnrichedRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    product = await db.products.find_one({"session_id": user.session_id, "sku": sku})
    if not product:
        raise HTTPException(status_code=404, detail="product not found")

    enriched = dict(product.get("enriched") or {})
    enriched_provenance = dict(product.get("enriched_provenance") or {})
    provenance = dict(product.get("provenance") or {})
    now = datetime.now(timezone.utc)

    source_updates: dict = {}
    updates = payload.model_dump(exclude_none=True)
    for field, value in updates.items():
        if field in SOURCE_FIELDS:
            source_updates[field] = value
            provenance[field] = "user_edit"
        elif field in ENRICHED_FIELDS:
            enriched[field] = value
            enriched_provenance[field] = {
                "by": "user_edit",
                "confidence": 1.0,
                "ts": now.isoformat(),
            }

    next_doc = {**product, **source_updates, "enriched": enriched}
    new_score = score_product(_apply_enriched_view(next_doc))

    await db.products.update_one(
        {"_id": product["_id"]},
        {
            "$set": {
                **source_updates,
                "enriched": enriched,
                "enriched_provenance": enriched_provenance,
                "provenance": provenance,
                "score": new_score,
                "updated_at": now,
            }
        },
    )

    return {
        "sku": sku,
        "source_fields": {k: next_doc.get(k) for k in SOURCE_FIELDS},
        "enriched_fields": enriched,
        "score": new_score,
        "confidence_scores": {
            k: v.get("confidence", 0.0) for k, v in enriched_provenance.items()
        },
    }
