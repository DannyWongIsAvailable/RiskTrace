from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings
from app.services.harness_service import run_harness_diagnostic

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])
ASYNC_RUN_CONTRACT = "risktrace.harness.async.v2"


class ProviderCheckRequest(BaseModel):
    checkId: str
    requestId: str | None = None
    source: str | None = None


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _verify_authorization(authorization: str | None) -> str:
    configured_secret = settings.harness_api_key
    if configured_secret is None:
        return "disabled"

    expected = configured_secret.get_secret_value()
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Harness bearer token",
        )

    supplied = authorization[len(prefix) :].strip()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Harness bearer token",
        )

    return "verified"


@router.get("/async-contract")
def async_contract(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Cheap contract probe used by Pages Provider Check; never launches a model run."""
    auth_state = _verify_authorization(authorization)
    run_manager_ready = getattr(request.app.state, "run_manager", None) is not None
    now = _timestamp()
    diagnostic_run_id = "harnessrun_contract_probe"

    return {
        "ok": run_manager_ready,
        "contract": ASYNC_RUN_CONTRACT,
        "service": {
            "name": "risktrace-deepseek-harness",
            "version": settings.app_version,
            "auth": auth_state,
            "runManagerReady": run_manager_ready,
        },
        "sampleRun": {
            "contract": ASYNC_RUN_CONTRACT,
            "runId": diagnostic_run_id,
            "status": "queued",
            "createdAt": now,
            "updatedAt": now,
            "pollUrl": f"/runs/{diagnostic_run_id}",
            "eventsUrl": f"/runs/{diagnostic_run_id}/events",
        },
        "endpoints": {
            "create": {"method": "POST", "path": "/runs", "successStatus": 202},
            "get": {"method": "GET", "path": "/runs/{runId}", "successStatus": 200},
            "events": {
                "method": "GET",
                "path": "/runs/{runId}/events?after={seq}&limit={limit}",
                "successStatus": 200,
                "pagination": "exclusive-after-seq",
            },
        },
    }


@router.post("/provider-check")
def provider_check(
    request: ProviderCheckRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    auth_state = _verify_authorization(authorization)
    logs: list[dict[str, Any]] = [
        {
            "timestamp": _timestamp(),
            "level": "info",
            "layer": "fastapi",
            "message": "FastAPI 已收到 Provider 检查请求",
            "details": {
                "checkId": request.checkId,
                "requestId": request.requestId,
                "source": request.source,
                "service": "risktrace-deepseek-harness",
                "version": settings.app_version,
                "auth": auth_state,
            },
        }
    ]

    result = run_harness_diagnostic(check_id=request.checkId)
    logs.extend(result.pop("logs"))
    logs.append(
        {
            "timestamp": _timestamp(),
            "level": "success" if result["ok"] else "error",
            "layer": "fastapi",
            "message": "FastAPI Provider 检查处理完成",
            "details": {
                "ok": result["ok"],
                "durationMs": result["durationMs"],
            },
        }
    )

    return {
        "checkId": request.checkId,
        "ok": result["ok"],
        "service": {
            "name": "risktrace-deepseek-harness",
            "version": settings.app_version,
        },
        "harness": result,
        "logs": logs,
    }
