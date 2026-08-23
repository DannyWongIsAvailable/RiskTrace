from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class RunNotFoundError(LookupError):
  """Raised when an asynchronous Harness run no longer exists in the local store."""


def _utcnow() -> datetime:
  return datetime.now(timezone.utc)


def _timestamp(value: datetime | None = None) -> str:
  return (value or _utcnow()).isoformat()


def _json_dumps(value: Any) -> str:
  return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(value: str | None) -> Any:
  if not value:
    return None
  try:
    return json.loads(value)
  except json.JSONDecodeError:
    return None


class RunStore:
  """SQLite-backed state store for long-running DeepSeek Harness executions."""

  def __init__(self, path: Path) -> None:
    self.path = path
    self.path.parent.mkdir(parents=True, exist_ok=True)
    self._initialize()

  def _connect(self) -> sqlite3.Connection:
    connection = sqlite3.connect(
      self.path,
      timeout=30,
      isolation_level=None,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection

  def _initialize(self) -> None:
    with self._connect() as connection:
      connection.execute("PRAGMA journal_mode = WAL")
      connection.execute("PRAGMA synchronous = NORMAL")
      connection.execute(
        """
        CREATE TABLE IF NOT EXISTS async_runs (
          run_id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
          request_json TEXT,
          output_json TEXT,
          final_response TEXT,
          message TEXT,
          error_json TEXT,
          harness_json TEXT,
          created_at TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT,
          updated_at TEXT NOT NULL
        )
        """,
      )
      connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_async_runs_status_updated ON async_runs(status, updated_at)",
      )
      connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_async_runs_finished ON async_runs(finished_at)",
      )

  def create_or_get(
    self,
    *,
    run_id: str,
    idempotency_key: str,
    request_payload: dict[str, Any],
  ) -> tuple[dict[str, Any], bool]:
    created_at = _timestamp()
    request_json = _json_dumps(request_payload)

    with self._connect() as connection:
      connection.execute("BEGIN IMMEDIATE")
      try:
        cursor = connection.execute(
          """
          INSERT OR IGNORE INTO async_runs (
            run_id, idempotency_key, status, request_json, created_at, updated_at
          ) VALUES (?, ?, 'queued', ?, ?, ?)
          """,
          (run_id, idempotency_key, request_json, created_at, created_at),
        )
        created = cursor.rowcount == 1
        if created:
          row = connection.execute(
            "SELECT * FROM async_runs WHERE run_id = ?",
            (run_id,),
          ).fetchone()
        else:
          row = connection.execute(
            "SELECT * FROM async_runs WHERE idempotency_key = ?",
            (idempotency_key,),
          ).fetchone()
        connection.execute("COMMIT")
      except Exception:
        connection.execute("ROLLBACK")
        raise

    if row is None:
      raise RuntimeError("Failed to create or load asynchronous Harness run")
    return self._to_snapshot(row), created

  def require(self, run_id: str) -> dict[str, Any]:
    with self._connect() as connection:
      row = connection.execute(
        "SELECT * FROM async_runs WHERE run_id = ?",
        (run_id,),
      ).fetchone()
    if row is None:
      raise RunNotFoundError(run_id)
    return self._to_snapshot(row)

  def mark_running(self, run_id: str) -> None:
    now = _timestamp()
    with self._connect() as connection:
      cursor = connection.execute(
        """
        UPDATE async_runs
        SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
        WHERE run_id = ? AND status = 'queued'
        """,
        (now, now, run_id),
      )
    if cursor.rowcount != 1:
      current = self.require(run_id)
      if current["status"] != "running":
        raise RuntimeError(f"Cannot transition Harness run {run_id} to running")

  def update_running_harness(self, run_id: str, harness: dict[str, Any]) -> None:
    with self._connect() as connection:
      connection.execute(
        """
        UPDATE async_runs
        SET harness_json = ?, updated_at = ?
        WHERE run_id = ? AND status = 'running'
        """,
        (_json_dumps(harness), _timestamp(), run_id),
      )

  def mark_completed(
    self,
    run_id: str,
    *,
    output: dict[str, Any],
    final_response: str,
    harness: dict[str, Any],
  ) -> None:
    now = _timestamp()
    with self._connect() as connection:
      connection.execute(
        """
        UPDATE async_runs
        SET status = 'completed', request_json = NULL, output_json = ?, final_response = ?,
            message = NULL, error_json = NULL, harness_json = ?, finished_at = ?, updated_at = ?
        WHERE run_id = ? AND status IN ('queued', 'running')
        """,
        (
          _json_dumps(output),
          final_response,
          _json_dumps(harness),
          now,
          now,
          run_id,
        ),
      )

  def mark_failed(
    self,
    run_id: str,
    *,
    message: str,
    error: dict[str, Any],
    final_response: str = "",
    harness: dict[str, Any] | None = None,
  ) -> None:
    now = _timestamp()
    with self._connect() as connection:
      connection.execute(
        """
        UPDATE async_runs
        SET status = 'failed', request_json = NULL, output_json = NULL,
            final_response = ?, message = ?, error_json = ?, harness_json = ?,
            finished_at = ?, updated_at = ?
        WHERE run_id = ? AND status IN ('queued', 'running')
        """,
        (
          final_response,
          message,
          _json_dumps(error),
          _json_dumps(harness or {}),
          now,
          now,
          run_id,
        ),
      )

  def reconcile_stale_runs_on_startup(self) -> int:
    """Fail queued/running rows left by a previous FastAPI process."""
    startup_time = _timestamp()
    error = {
      "code": "SERVICE_RESTARTED",
      "message": "Harness 服务重启，本次执行已中断，请重试",
    }
    harness = {
      "finishReason": "service_restarted",
      "eventCount": 0,
      "lastTurnEnd": None,
      "eventSummary": [],
    }
    with self._connect() as connection:
      cursor = connection.execute(
        """
        UPDATE async_runs
        SET status = 'failed', request_json = NULL,
            message = ?, error_json = ?, harness_json = ?,
            finished_at = ?, updated_at = ?
        WHERE status IN ('queued', 'running') AND updated_at < ?
        """,
        (
          error["message"],
          _json_dumps(error),
          _json_dumps(harness),
          startup_time,
          startup_time,
          startup_time,
        ),
      )
      return cursor.rowcount

  def prune_terminal_runs(self, retention_hours: int) -> int:
    cutoff = _timestamp(_utcnow() - timedelta(hours=retention_hours))
    with self._connect() as connection:
      cursor = connection.execute(
        """
        DELETE FROM async_runs
        WHERE status IN ('completed', 'failed')
          AND finished_at IS NOT NULL
          AND finished_at < ?
        """,
        (cutoff,),
      )
      return cursor.rowcount

  @staticmethod
  def _to_snapshot(row: sqlite3.Row) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
      "runId": row["run_id"],
      "status": row["status"],
      "createdAt": row["created_at"],
      "updatedAt": row["updated_at"],
    }

    if row["started_at"]:
      snapshot["startedAt"] = row["started_at"]
    if row["finished_at"]:
      snapshot["finishedAt"] = row["finished_at"]

    output = _json_loads(row["output_json"])
    if output is not None:
      snapshot["output"] = output

    if row["final_response"] is not None:
      snapshot["finalResponse"] = row["final_response"]
    if row["message"]:
      snapshot["message"] = row["message"]

    error = _json_loads(row["error_json"])
    if error is not None:
      snapshot["error"] = error

    harness = _json_loads(row["harness_json"])
    if harness:
      snapshot["harness"] = harness

    return snapshot
