from __future__ import annotations
import logging

from app.services.harness_service import run_review
from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter()

logger = logging.getLogger(__name__)

class ProjectPayload(BaseModel):
    projectId: str
    reviewRunId: str
    projectTitle: str


class FilePayload(BaseModel):
    documentId: str
    fileName: str
    mimeType: str
    fileUrl: str
    parseStrategy: str | None = None


class CreateRunRequest(BaseModel):
    contract: str
    idempotencyKey: str
    project: ProjectPayload
    files: list[FilePayload]


@router.post("/runs")
def create_run(request: CreateRunRequest):
    run_id = request.idempotencyKey

    try:
        output = run_review(
            payload=request.model_dump(),
            run_id=run_id,
        )

        return {
            "runId": run_id,
            "status": "completed",
            "output": output,
        }

    except Exception as exc:
        logger.exception(
            "Review failed: run_id=%s",
            run_id,
        )

        return {
            "runId": run_id,
            "status": "failed",
            "message": str(exc),
        }