from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import CurrentUser, get_current_user
from app.db.mongo import get_db

router = APIRouter(prefix="/session", tags=["session"])


def _strip_db_id(doc: dict) -> dict:
    out = dict(doc)
    out.pop("_id", None)
    out.pop("session_id", None)
    out.pop("created_at", None)
    out.pop("updated_at", None)
    return out


@router.get("")
async def get_session(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    session = await db.sessions.find_one({"_id": user.session_id})
    products_cursor = db.products.find({"session_id": user.session_id}).sort("sku", 1)
    products = [_strip_db_id(p) async for p in products_cursor]

    return {
        "session_id": user.session_id,
        "phase": (session or {}).get("phase", "upload"),
        "products": products,
        "scored_products": [
            {"sku": p["sku"], **p["score"]} for p in products if p.get("score")
        ],
        "enriched_products": [
            {
                "sku": p["sku"],
                "original_fields": {k: p.get(k) for k in ("name", "description", "price", "category", "brand", "image_urls", "attributes")},
                "enriched_fields": p["enriched"],
                "provenance_metadata": {"source": "ria_enriched"},
                "confidence_scores": {
                    k: v.get("confidence", 0.0)
                    for k, v in (p.get("enriched_provenance") or {}).items()
                },
            }
            for p in products
            if p.get("enriched")
        ],
    }


@router.post("/reset")
async def reset_session(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    await db.products.delete_many({"session_id": user.session_id})
    await db.transcripts.delete_many({"session_id": user.session_id})
    await db.sessions.update_one(
        {"_id": user.session_id},
        {"$set": {"phase": "upload", "last_activity": datetime.now(timezone.utc)}},
    )
    return {"session_id": user.session_id, "phase": "upload"}
