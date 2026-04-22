from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import CurrentUser, get_current_user
from app.db.mongo import get_db
from app.services.ingest import ingest

router = APIRouter(prefix="/catalog", tags=["catalog"])

DedupeStrategy = Literal["detect", "merge", "first"]


def _strip_db_id(doc: dict) -> dict:
    out = dict(doc)
    out.pop("_id", None)
    out.pop("session_id", None)
    out.pop("created_at", None)
    out.pop("updated_at", None)
    return out


@router.post("/upload")
async def upload_catalog(
    file: UploadFile = File(...),
    dedupe_strategy: DedupeStrategy = Form("merge"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="please upload a .csv file")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="uploaded file is empty")

    result = ingest(raw, strategy=dedupe_strategy)

    if result.report.missing_required:
        missing = ", ".join(result.report.missing_required)
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing required column(s): {missing}",
        )

    if result.needs_dedupe:
        return {
            "needs_dedupe": True,
            "report": result.report.__dict__,
            "preview": result.products[:5],
        }

    if not result.products:
        raise HTTPException(status_code=400, detail="no valid product rows found")

    now = datetime.now(timezone.utc)
    await db.products.delete_many({"session_id": user.session_id})
    docs = []
    for p in result.products:
        docs.append(
            {
                **p,
                "session_id": user.session_id,
                "score": None,
                "enriched": None,
                "provenance": {
                    k: "source"
                    for k, v in p.items()
                    if v not in (None, "", [], {})
                },
                "enriched_provenance": {},
                "audit_trail": [],
                "created_at": now,
                "updated_at": now,
            }
        )
    if docs:
        await db.products.insert_many(docs)

    await db.sessions.update_one(
        {"_id": user.session_id},
        {"$set": {"phase": "upload", "last_activity": now}},
    )

    return {
        "needs_dedupe": False,
        "products": [_strip_db_id(d) for d in docs],
        "report": result.report.__dict__,
    }
