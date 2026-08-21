from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_directories()

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "risktrace-deepseek-harness",
        "version": settings.app_version,
    }