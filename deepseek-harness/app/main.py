from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.diagnostics import router as diagnostics_router
from app.api.runs import router as runs_router
from app.core.config import settings
from app.services.run_manager import RunManager
from app.storage.run_store import RunStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_directories()
    store = RunStore(settings.harness_run_db)
    manager = RunManager(
        store=store,
        max_workers=settings.harness_max_concurrency,
        result_retention_hours=settings.harness_result_retention_hours,
    )
    app.state.run_store = store
    app.state.run_manager = manager
    manager.reconcile_stale_runs_on_startup()
    try:
        yield
    finally:
        manager.shutdown()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.include_router(runs_router)
app.include_router(diagnostics_router)


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "risktrace-deepseek-harness",
        "version": settings.app_version,
    }
