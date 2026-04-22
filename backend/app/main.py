from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.db import mongo


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await mongo.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="RIA Backend", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz() -> JSONResponse:
        db_ok = await mongo.ping()
        body = {"status": "ok" if db_ok else "degraded", "db": "ok" if db_ok else "error"}
        return JSONResponse(status_code=200 if db_ok else 503, content=body)

    app.include_router(v1_router)
    return app


app = create_app()
