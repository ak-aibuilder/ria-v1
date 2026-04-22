from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")


@router.get("/")
async def root() -> dict:
    return {"service": "ria", "version": "v1"}
