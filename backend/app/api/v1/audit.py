from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import CurrentUser, get_current_user
from app.db.mongo import get_db
from app.services.audit import score_product

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/run")
async def run_audit(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    cursor = db.products.find({"session_id": user.session_id})
    products = [p async for p in cursor]
    if not products:
        raise HTTPException(status_code=409, detail="upload a catalog before running the audit")

    now = datetime.now(timezone.utc)
    results = []
    for p in products:
        view = {
            **p,
            "enriched": p.get("enriched"),
        }
        if p.get("enriched"):
            for field in ("description", "q_and_a", "agent_facets", "relationship_type"):
                value = p["enriched"].get(field)
                if value not in (None, "", [], {}):
                    view[field] = value
        score = score_product(view)
        await db.products.update_one(
            {"_id": p["_id"]},
            {"$set": {"score": score, "updated_at": now}},
        )
        results.append({"sku": p["sku"], **score})

    await db.sessions.update_one(
        {"_id": user.session_id},
        {"$set": {"phase": "audit", "last_activity": now}},
    )
    return {"scored_products": results}


@router.post("/rescore/{sku}")
async def rescore_one(
    sku: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    p = await db.products.find_one({"session_id": user.session_id, "sku": sku})
    if not p:
        raise HTTPException(status_code=404, detail="product not found in this session")

    view = {**p}
    if p.get("enriched"):
        for field in ("description", "q_and_a", "agent_facets", "relationship_type"):
            value = p["enriched"].get(field)
            if value not in (None, "", [], {}):
                view[field] = value
    score = score_product(view)
    await db.products.update_one(
        {"_id": p["_id"]},
        {"$set": {"score": score, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"sku": sku, **score}
