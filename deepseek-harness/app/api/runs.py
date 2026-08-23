from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings
from app.services.run_manager import RunManager
from app.storage.run_store import RunNotFoundError


router = APIRouter(tags=["runs"])


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


def _verify_authorization(authorization: str | None) -> None:
  configured_secret = settings.harness_api_key
  if configured_secret is None:
    return

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


def _manager(request: Request) -> RunManager:
  manager = getattr(request.app.state, "run_manager", None)
  if not isinstance(manager, RunManager):
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Harness run manager is not ready",
    )
  return manager


@router.post("/runs", status_code=status.HTTP_202_ACCEPTED)
def create_run(
  body: CreateRunRequest,
  request: Request,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  _verify_authorization(authorization)
  snapshot = _manager(request).submit(body.model_dump())
  snapshot.setdefault("pollUrl", f"/runs/{snapshot['runId']}")
  return snapshot


@router.get("/runs/{run_id}")
def get_run(
  run_id: str,
  request: Request,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  _verify_authorization(authorization)
  try:
    return _manager(request).get(run_id)
  except RunNotFoundError as exc:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Harness run not found",
    ) from exc
