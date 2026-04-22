from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Phase = Literal["upload", "audit", "enrich", "validate"]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    token: str
    session_id: str


class MeResponse(BaseModel):
    email: EmailStr
    session_id: str
    phase: Phase


class SessionDoc(BaseModel):
    id: str
    user_id: str
    phase: Phase = "upload"
    created_at: datetime
    last_activity: datetime
