from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import uuid4

from app.services.harness_service import HarnessExecutionError, run_review_detailed
from app.storage.run_store import RunStore


logger = logging.getLogger(__name__)


class RunManager:
  """Owns the in-process executor used to detach Harness work from HTTP requests."""

  def __init__(
    self,
    *,
    store: RunStore,
    max_workers: int,
    result_retention_hours: int,
  ) -> None:
    self.store = store
    self.executor = ThreadPoolExecutor(
      max_workers=max_workers,
      thread_name_prefix="risktrace-harness",
    )
    self.result_retention_hours = result_retention_hours
    self._cleanup_lock = threading.Lock()
    self._last_cleanup_monotonic = 0.0

  def submit(self, request_payload: dict[str, Any]) -> dict[str, Any]:
    self._cleanup_if_due()
    idempotency_key = str(request_payload.get("idempotencyKey") or "").strip()
    if not idempotency_key:
      raise ValueError("idempotencyKey is required")

    candidate_run_id = f"harnessrun_{uuid4().hex}"
    snapshot, created = self.store.create_or_get(
      run_id=candidate_run_id,
      idempotency_key=idempotency_key,
      request_payload=request_payload,
    )

    if created:
      self.executor.submit(self._execute, snapshot["runId"], request_payload)

    return snapshot

  def get(self, run_id: str) -> dict[str, Any]:
    self._cleanup_if_due()
    return self.store.require(run_id)

  def reconcile_stale_runs_on_startup(self) -> int:
    reconciled = self.store.reconcile_stale_runs_on_startup()
    if reconciled:
      logger.warning("Marked %s stale Harness run(s) failed after service restart", reconciled)
    self.store.prune_terminal_runs(self.result_retention_hours)
    return reconciled

  def shutdown(self) -> None:
    self.executor.shutdown(wait=False, cancel_futures=True)

  def _execute(self, run_id: str, request_payload: dict[str, Any]) -> None:
    review_run_id = str(
      (request_payload.get("project") or {}).get("reviewRunId") or run_id,
    )
    self.store.mark_running(run_id)

    notification_state: dict[str, Any] = {
      "sessionId": None,
      "eventCount": 0,
      "lastEventType": None,
    }
    last_flush = 0.0

    def on_notification(notification: Any) -> None:
      nonlocal last_flush
      try:
        method = getattr(notification, "method", None)
        payload = getattr(notification, "payload", None)
        if method != "session.event" or not isinstance(payload, dict):
          return

        session_id = payload.get("sessionId")
        if notification_state["sessionId"] is None and isinstance(session_id, str):
          notification_state["sessionId"] = session_id
        if session_id != notification_state["sessionId"]:
          return

        event = payload.get("event")
        if isinstance(event, dict):
          notification_state["eventCount"] += 1
          event_type = event.get("type")
          if isinstance(event_type, str):
            notification_state["lastEventType"] = event_type

        current = time.monotonic()
        if notification_state["eventCount"] == 1 or current - last_flush >= 2.0:
          self.store.update_running_harness(run_id, dict(notification_state))
          last_flush = current
      except Exception:
        # Diagnostics must never be able to fail the actual model execution.
        logger.exception("Failed to persist live Harness diagnostics: run_id=%s", run_id)

    try:
      execution = run_review_detailed(
        payload=request_payload,
        run_id=review_run_id,
        on_notification=on_notification,
      )
      self.store.mark_completed(
        run_id,
        output=execution["output"],
        final_response=execution["finalResponse"],
        harness=execution["harness"],
      )
      logger.info(
        "Harness run completed: review_run_id=%s execute_id=%s harness_session_id=%s finish_reason=%s event_count=%s",
        review_run_id,
        run_id,
        execution["harness"].get("sessionId"),
        execution["harness"].get("finishReason"),
        execution["harness"].get("eventCount"),
      )
    except HarnessExecutionError as exc:
      self.store.mark_failed(
        run_id,
        message=str(exc),
        error=exc.to_api_error(),
        final_response=exc.final_response,
        harness=exc.to_harness_diagnostics(),
      )
      logger.exception(
        "Harness run failed: review_run_id=%s execute_id=%s finish_reason=%s",
        review_run_id,
        run_id,
        exc.finish_reason,
      )
    except Exception as exc:
      message = f"Unhandled review exception [{type(exc).__name__}]: {exc}"
      self.store.mark_failed(
        run_id,
        message=message,
        error={
          "code": "REVIEW_UNHANDLED_EXCEPTION",
          "message": str(exc),
          "exceptionType": type(exc).__name__,
        },
        harness={
          "sessionId": notification_state.get("sessionId"),
          "finishReason": "error",
          "eventCount": notification_state.get("eventCount", 0),
          "lastEventType": notification_state.get("lastEventType"),
          "lastTurnEnd": None,
          "eventSummary": [],
        },
      )
      logger.exception(
        "Unhandled Harness run exception: review_run_id=%s execute_id=%s",
        review_run_id,
        run_id,
      )

  def _cleanup_if_due(self) -> None:
    current = time.monotonic()
    if current - self._last_cleanup_monotonic < 3600:
      return
    with self._cleanup_lock:
      current = time.monotonic()
      if current - self._last_cleanup_monotonic < 3600:
        return
      self.store.prune_terminal_runs(self.result_retention_hours)
      self._last_cleanup_monotonic = current
