from __future__ import annotations
import logging

from app.services.harness_service import HarnessExecutionError, run_review_detailed
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
        execution = run_review_detailed(
            payload=request.model_dump(),
            run_id=run_id,
        )

        return {
            "runId": run_id,
            "status": "completed",
            "output": execution["output"],
            # Raw root-session assistant text returned by the official SDK.
            # Keep this separate from the normalized RiskTrace output.
            "finalResponse": execution["finalResponse"],
            "harness": execution["harness"],
        }

    except HarnessExecutionError as exc:
        logger.exception(
            "Harness review failed: run_id=%s finish_reason=%s harness_error=%s",
            run_id,
            exc.finish_reason,
            exc.harness_error,
        )

        return {
            "runId": run_id,
            "status": "failed",
            # Keep message at the top level because the existing Pages adapter
            # already forwards it into RiskTrace's WORKFLOW_EXECUTION_FAILED text.
            "message": str(exc),
            "error": exc.to_api_error(),
            "finalResponse": exc.final_response,
            "harness": exc.to_harness_diagnostics(),
        }

    except Exception as exc:
        logger.exception(
            "Review failed: run_id=%s",
            run_id,
        )

        return {
            "runId": run_id,
            "status": "failed",
            "message": f"Unhandled review exception [{type(exc).__name__}]: {exc}",
            "error": {
                "code": "REVIEW_UNHANDLED_EXCEPTION",
                "message": str(exc),
                "exceptionType": type(exc).__name__,
            },
            "finalResponse": "",
            "harness": {
                "finishReason": "error",
                "eventCount": 0,
                "lastTurnEnd": None,
                "eventSummary": [],
            },
        }