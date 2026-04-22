from datetime import datetime, timezone

from bson import ObjectId
from fastapi import Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import decode_token
from app.db.mongo import get_db


class CurrentUser:
    def __init__(self, *, user_id: str, email: str, session_id: str) -> None:
        self.user_id = user_id
        self.email = email
        self.session_id = session_id


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    session_id = payload.get("sid")
    user_id = payload.get("sub")
    email = payload.get("email")
    if not session_id or not user_id or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="malformed token")

    session = await db.sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired")

    await db.sessions.update_one(
        {"_id": session_id}, {"$set": {"last_activity": datetime.now(timezone.utc)}}
    )
    return CurrentUser(user_id=user_id, email=email, session_id=session_id)


def to_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="invalid id") from exc
