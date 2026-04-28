from fastapi import APIRouter

from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.enrich import router as enrich_router
from app.api.v1.session import router as session_router
from app.api.v1.validate import router as validate_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(catalog_router)
router.include_router(session_router)
router.include_router(audit_router)
router.include_router(enrich_router)
router.include_router(validate_router)


@router.get("/")
async def root() -> dict:
    return {"service": "ria", "version": "v1"}
