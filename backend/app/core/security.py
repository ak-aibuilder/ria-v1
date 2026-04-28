import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

_hasher = PasswordHasher()
ALGORITHM = "HS256"

# Session lifetime — 30 minutes per the PRD (also drives the sessions TTL index).
JWT_EXPIRES_SECONDS = 30 * 60

# Generated fresh per process; the PRD already guarantees "backend restart
# clears all sessions", so a runtime secret is the simplest correct behavior:
# nothing to provision, store, rotate, or leak.
_JWT_SECRET = secrets.token_urlsafe(32)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(*, user_id: str, session_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "sid": session_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=JWT_EXPIRES_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, _JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return None
