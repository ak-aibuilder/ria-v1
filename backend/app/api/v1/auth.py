import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import CurrentUser, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.mongo import get_db
from app.models import AuthResponse, LoginRequest, MeResponse, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


async def _start_session(db: AsyncIOMotorDatabase, user_id: str) -> str:
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one(
        {
            "_id": session_id,
            "user_id": user_id,
            "phase": "upload",
            "created_at": now,
            "last_activity": now,
        }
    )
    return session_id


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncIOMotorDatabase = Depends(get_db)) -> AuthResponse:
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="email already registered")

    user_doc = {
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    session_id = await _start_session(db, user_id)
    token = create_access_token(user_id=user_id, session_id=session_id, email=payload.email.lower())
    return AuthResponse(token=token, session_id=session_id)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)) -> AuthResponse:
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")

    user_id = str(user["_id"])
    session_id = await _start_session(db, user_id)
    token = create_access_token(user_id=user_id, session_id=session_id, email=user["email"])
    return AuthResponse(token=token, session_id=session_id)


@router.post("/logout")
async def logout(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    await db.sessions.delete_one({"_id": user.session_id})
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MeResponse:
    session = await db.sessions.find_one({"_id": user.session_id})
    phase = session.get("phase", "upload") if session else "upload"
    return MeResponse(email=user.email, session_id=user.session_id, phase=phase)
