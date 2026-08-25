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

LIVE_EVENT_PAGE_LIMIT = 200
COMPLETED_EVENT_PAGE_LIMIT = 5000


class RunManager:
  """Owns detached Harness execution plus durable, replayable Session Events."""

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

  def get_events(self, run_id: str, *, after_seq: int, limit: int) -> dict[str, Any]:
    self._cleanup_if_due()
    snapshot = self.store.require(run_id)
    max_limit = (
      COMPLETED_EVENT_PAGE_LIMIT
      if snapshot.get("status") == "completed"
      else LIVE_EVENT_PAGE_LIMIT
    )
    effective_limit = max(1, min(max_limit, int(limit)))
    events, has_more = self.store.list_events(
      run_id,
      after_seq=after_seq,
      limit=effective_limit,
    )
    next_seq = after_seq
    if events:
      last_seq = events[-1].get("seq")
      if isinstance(last_seq, int):
        next_seq = last_seq

    session_id = self.store.get_event_session_id(run_id)
    if session_id is None:
      harness = snapshot.get("harness")
      if isinstance(harness, dict):
        candidate = harness.get("sessionId")
        if isinstance(candidate, str) and candidate:
          session_id = candidate

    return {
      "runId": run_id,
      "sessionId": session_id,
      "events": events,
      "nextSeq": next_seq,
      "hasMore": has_more,
    }

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

    def persist_event(session_id: str, event: dict[str, Any]) -> bool:
      inserted = self.store.append_event(run_id, session_id, event)
      if inserted:
        notification_state["eventCount"] = self.store.count_events(run_id)
        event_type = event.get("type")
        if isinstance(event_type, str):
          notification_state["lastEventType"] = event_type
      return inserted

    def on_notification(notification: Any) -> None:
      nonlocal last_flush
      try:
        method = getattr(notification, "method", None)
        payload = getattr(notification, "payload", None)
        if method != "session.event" or not isinstance(payload, dict):
          return

        session_id = payload.get("sessionId")
        event = payload.get("event")
        if not isinstance(session_id, str) or not session_id or not isinstance(event, dict):
          return

        if notification_state["sessionId"] is None:
          notification_state["sessionId"] = session_id
        if session_id != notification_state["sessionId"]:
          return

        inserted = persist_event(session_id, event)
        current = time.monotonic()
        if inserted and (notification_state["eventCount"] == 1 or current - last_flush >= 1.0):
          self.store.update_running_harness(run_id, dict(notification_state))
          last_flush = current
      except Exception:
        # Session Event persistence is observability; it must never abort the agent loop.
        logger.exception("Failed to persist live Harness Session Event: run_id=%s", run_id)

    def backfill_events(session_id: str | None, events: list[dict[str, Any]]) -> None:
      if not session_id:
        return
      for event in events:
        if not isinstance(event, dict):
          continue
        try:
          persist_event(session_id, event)
        except Exception:
          logger.exception(
            "Failed to backfill Harness Session Event: run_id=%s session_id=%s",
            run_id,
            session_id,
          )

    try:
      execution = run_review_detailed(
        payload=request_payload,
        run_id=review_run_id,
        on_notification=on_notification,
      )
      harness = execution["harness"]
      session_id = harness.get("sessionId") if isinstance(harness, dict) else None
      backfill_events(session_id if isinstance(session_id, str) else None, execution.get("events", []))
      if isinstance(harness, dict):
        harness["eventCount"] = self.store.count_events(run_id)

      self.store.mark_completed(
        run_id,
        output=execution["output"],
        final_response=execution["finalResponse"],
        harness=harness,
      )
      logger.info(
        "Harness run completed: review_run_id=%s execute_id=%s harness_session_id=%s finish_reason=%s event_count=%s",
        review_run_id,
        run_id,
        harness.get("sessionId"),
        harness.get("finishReason"),
        harness.get("eventCount"),
      )
    except HarnessExecutionError as exc:
      backfill_events(exc.session_id, exc.events)
      diagnostics = exc.to_harness_diagnostics()
      diagnostics["eventCount"] = self.store.count_events(run_id)
      self.store.mark_failed(
        run_id,
        message=str(exc),
        error=exc.to_api_error(),
        final_response=exc.final_response,
        harness=diagnostics,
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
          "eventCount": self.store.count_events(run_id),
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
