import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, get_current_user
from app.db.mongo import get_db
from app.services.agent import run_agent
from app.services.agent_index import EnrichedProductIndex
from app.services.claude import EnrichmentError

router = APIRouter(prefix="/validate", tags=["validate"])


class ValidateQueryRequest(BaseModel):
    query: str = Field(min_length=10, max_length=500)


async def _load_chat(db: AsyncIOMotorDatabase, session_id: str, label: str) -> tuple[list[dict], list[dict]]:
    chat = await db.agent_chats.find_one({"_id": f"{session_id}:{label}"})
    if not chat:
        return [], []
    raw_msgs = chat.get("messages", []) or []
    # Defensive: drop any leading tool_result orphans left over from prior bug
    # so we never hand Claude a request that starts mid-tool-call.
    start = 0
    while start < len(raw_msgs) and not _is_plain_user_message(raw_msgs[start]):
        start += 1
    safe_msgs = raw_msgs[start:] if start < len(raw_msgs) else []
    return safe_msgs, chat.get("cart", []) or []


def _is_plain_user_message(msg: dict) -> bool:
    """A safe truncation boundary: user message that's NOT a tool_result reply.

    Plain user text starts a fresh conversational segment with no dangling
    tool_use_id references, so we can safely drop everything before it.
    """
    if msg.get("role") != "user":
        return False
    content = msg.get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        return not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
    return False


def _cap_messages(messages: list[dict], max_count: int = 24) -> list[dict]:
    """Cap to ~max_count messages, snapping the start to a safe boundary so
    we never persist an orphan tool_result with no matching tool_use.
    """
    if len(messages) <= max_count:
        return messages
    start = len(messages) - max_count
    while start < len(messages) and not _is_plain_user_message(messages[start]):
        start += 1
    if start >= len(messages):
        # Pathological — couldn't find a clean boundary in the window. Drop
        # the whole history rather than persist something Claude will reject.
        return []
    return messages[start:]


async def _save_chat(
    db: AsyncIOMotorDatabase, session_id: str, label: str, messages: list[dict], cart: list[dict]
) -> None:
    capped = _cap_messages(messages, max_count=24)
    await db.agent_chats.update_one(
        {"_id": f"{session_id}:{label}"},
        {
            "$set": {
                "session_id": session_id,
                "label": label,
                "messages": capped,
                "cart": cart,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


@router.post("/query")
async def validate_query(
    payload: ValidateQueryRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    products = [p async for p in db.products.find({"session_id": user.session_id})]
    if not products:
        raise HTTPException(status_code=409, detail="upload a catalog before validating")
    if not any(p.get("enriched") for p in products):
        raise HTTPException(status_code=409, detail="run enrichment before validating")

    pre_index = EnrichedProductIndex.from_products(products, use_enriched=False)
    post_index = EnrichedProductIndex.from_products(products, use_enriched=True)

    pre_msgs, pre_cart = await _load_chat(db, user.session_id, "pre")
    post_msgs, post_cart = await _load_chat(db, user.session_id, "post")

    try:
        pre_task = run_agent(
            query=payload.query,
            index=pre_index,
            index_label="pre",
            agent_id="ria-demo-agent",
            retailer_id="demo-apparel",
            prior_messages=pre_msgs,
            prior_cart=pre_cart,
        )
        post_task = run_agent(
            query=payload.query,
            index=post_index,
            index_label="post",
            agent_id="ria-demo-agent",
            retailer_id="demo-apparel",
            prior_messages=post_msgs,
            prior_cart=post_cart,
        )
        pre_result, post_result = await asyncio.gather(pre_task, post_task)
    except EnrichmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    await _save_chat(db, user.session_id, "pre", pre_result.pop("messages"), pre_result.get("cart_preview") or [])
    await _save_chat(db, user.session_id, "post", post_result.pop("messages"), post_result.get("cart_preview") or [])

    transcripts_to_insert = [
        {**pre_result, "session_id": user.session_id, "created_at": now},
        {**post_result, "session_id": user.session_id, "created_at": now},
    ]
    await db.transcripts.insert_many(transcripts_to_insert)
    await db.sessions.update_one(
        {"_id": user.session_id},
        {"$set": {"phase": "validate", "last_activity": now}},
    )

    return {"pre": pre_result, "post": post_result}
