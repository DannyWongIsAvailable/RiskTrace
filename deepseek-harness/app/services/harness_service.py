from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Callable
from uuid import uuid4

from deepseek_harness import DeepSeekHarness

from app.core.config import settings


MATERIAL_CATEGORIES = {
  "采购立项与审批",
  "供应商与寻源",
  "合同与补充协议",
  "订单与执行",
  "交付与验收",
  "发票与付款",
  "其他材料",
  "无法判断",
}

RISK_LEVELS = {"low", "medium", "high", "critical"}
COMPLETENESS_RESULTS = {"complete", "incomplete", "uncertain"}


class HarnessExecutionError(RuntimeError):
  """Structured Harness failure that can be returned safely by the HTTP API."""

  def __init__(
    self,
    message: str,
    *,
    finish_reason: str | None = None,
    final_response: str = "",
    harness_error: dict[str, Any] | None = None,
    event_count: int = 0,
    last_turn_end: dict[str, Any] | None = None,
    event_summary: list[dict[str, Any]] | None = None,
    exception_type: str | None = None,
    session_id: str | None = None,
  ) -> None:
    super().__init__(message)
    self.finish_reason = finish_reason
    self.final_response = final_response
    self.harness_error = harness_error
    self.event_count = event_count
    self.last_turn_end = last_turn_end
    self.event_summary = event_summary or []
    self.exception_type = exception_type
    self.session_id = session_id

  def to_api_error(self) -> dict[str, Any]:
    error: dict[str, Any] = {
      "code": "HARNESS_EXECUTION_FAILED",
      "message": str(self),
    }
    if self.exception_type:
      error["exceptionType"] = self.exception_type
    if self.harness_error:
      error["harnessError"] = self.harness_error
    return error

  def to_harness_diagnostics(self) -> dict[str, Any]:
    return {
      "sessionId": self.session_id,
      "finishReason": self.finish_reason,
      "eventCount": self.event_count,
      "lastTurnEnd": self.last_turn_end,
      "eventSummary": self.event_summary,
    }


def _safe_text(
  value: Any,
  default: str,
  max_length: int,
) -> str:
  """Convert loose model output into a non-empty bounded string."""
  if isinstance(value, str):
    text = value.strip()
  elif isinstance(value, (int, float, bool)):
    text = str(value)
  elif isinstance(value, list):
    parts = [str(item).strip() for item in value if str(item).strip()]
    text = "、".join(parts)
  elif isinstance(value, dict):
    try:
      text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except Exception:
      text = ""
  else:
    text = ""

  if not text:
    text = default

  return text[:max_length]


def _safe_string_list(
  value: Any,
  *,
  max_items: int,
  max_length: int,
) -> list[str]:
  if not isinstance(value, list):
    return []

  result: list[str] = []
  seen: set[str] = set()

  for item in value[:max_items]:
    text = _safe_text(item, "", max_length)
    if text and text not in seen:
      seen.add(text)
      result.append(text)

  return result


def _normalize_risk_level(value: Any, default: str = "medium") -> str:
  if isinstance(value, str):
    normalized = value.strip().lower()
    if normalized in RISK_LEVELS:
      return normalized
  return default


def _normalize_category(value: Any) -> str:
  if isinstance(value, str):
    normalized = value.strip()
    if normalized in MATERIAL_CATEGORIES:
      return normalized
  return "无法判断"


def _normalize_completeness(
  value: Any,
  *,
  default_result: str = "uncertain",
  default_summary: str = "材料完整性暂无法确认。",
) -> dict[str, Any]:
  record = value if isinstance(value, dict) else {}

  result = record.get("result")
  if not isinstance(result, str) or result.strip() not in COMPLETENESS_RESULTS:
    result = default_result
  else:
    result = result.strip()

  # 兼容旧/模型自由输出中的 reason 字段，最终统一为 Pages 要求的 summary。
  summary_value = record.get("summary")
  if not isinstance(summary_value, str) or not summary_value.strip():
    summary_value = record.get("reason")

  return {
    "result": result,
    "summary": _safe_text(
      summary_value,
      default_summary,
      1500,
    ),
    "missingMaterials": _safe_string_list(
      record.get("missingMaterials"),
      max_items=30,
      max_length=120,
    ),
  }


def _document_refs(payload: dict[str, Any]) -> list[dict[str, str]]:
  refs: list[dict[str, str]] = []
  for file in payload.get("files", []):
    if not isinstance(file, dict):
      continue
    document_id = _safe_text(file.get("documentId"), "unknown-document", 80)
    file_name = _safe_text(file.get("fileName"), "未知文件", 255)
    refs.append(
      {
        "documentId": document_id,
        "fileName": file_name,
      }
    )
  return refs


def _build_degraded_output(
  payload: dict[str, Any],
  reason: str,
  *,
  raw_response: str = "",
) -> dict[str, Any]:
  """
  Build a fully valid RiskTrace result when document parsing/tooling is unavailable
  or the model result cannot be normalized.

  Important: overallRiskLevel must remain one of low/medium/high/critical.
  "uncertain" is only valid for completeness.result.
  """
  files = [
    file
    for file in payload.get("files", [])
    if isinstance(file, dict)
  ]

  materials = []
  for file in files:
    file_name = _safe_text(file.get("fileName"), "未知文件", 255)
    materials.append(
      {
        "documentId": _safe_text(
          file.get("documentId"),
          "unknown-document",
          80,
        ),
        "materialName": file_name,
        "category": "无法判断",
        "summary": (
          "当前未能可靠读取该文件正文，"
          "因此无法对材料内容进行实质性识别与判断。"
        ),
      }
    )

  description = _safe_text(
    reason,
    "当前文档解析能力不可用，无法完成材料正文审查。",
    1800,
  )

  if raw_response:
    preview = _safe_text(raw_response, "", 400)
    if preview:
      description = _safe_text(
        f"{description} 模型原始返回摘要：{preview}",
        description,
        2000,
      )

  return {
    "materialAnalysis": {
      "summary": (
        "本次未能完成材料正文解析。系统已保留上传文件记录，"
        "并以降级模式生成结构化结果。"
      ),
      "materials": materials,
      "completeness": {
        "result": "uncertain",
        "summary": (
          "由于文档正文未能可靠解析，"
          "当前无法确认采购材料是否完整。"
        ),
        "missingMaterials": [],
      },
    },
    "finalReport": {
      "summary": (
        "本次审查未能可靠读取上传材料正文，"
        "因此无法完成实质性采购合规风险判断。"
      ),
      "overallRiskLevel": "medium",
      "completeness": {
        "result": "uncertain",
        "summary": (
          "文档解析能力不可用或模型输出无法可靠结构化，"
          "材料完整性暂无法确认。"
        ),
        "missingMaterials": [],
      },
      "findings": [
        {
          "domain": "文档解析与系统能力",
          "title": "文档解析能力不可用",
          "riskLevel": "medium",
          "description": description,
          "relatedDocuments": _document_refs(payload),
          "recommendation": (
            "请检查 MinerU Gateway、Harness 文档解析插件及文件访问能力后重新执行审查。"
          ),
        }
      ],
      "limitations": [
        "未能可靠读取上传文件正文",
        "当前结构化结果用于说明能力降级，不代表已完成实质性采购合规审查",
      ],
    },
  }


def build_prompt(payload: dict[str, Any]) -> str:
  project = payload["project"]
  files = payload["files"]

  file_lines = []

  for i, file in enumerate(files, start=1):
    file_lines.append(
      f"""
材料 {i}
documentId: {file["documentId"]}
fileName: {file["fileName"]}
mimeType: {file["mimeType"]}
fileUrl: {file["fileUrl"]}
parseStrategy: {file.get("parseStrategy")}
""".strip()
    )

  files_text = "\n\n".join(file_lines)

  schema_example = {
    "materialAnalysis": {
      "summary": "材料总体情况",
      "materials": [
        {
          "documentId": "必须来自输入材料的 documentId",
          "materialName": "材料名称",
          "category": "无法判断",
          "summary": "材料摘要",
        }
      ],
      "completeness": {
        "result": "uncertain",
        "summary": "完整性说明",
        "missingMaterials": [],
      },
    },
    "finalReport": {
      "summary": "项目总体审查结论",
      "overallRiskLevel": "medium",
      "completeness": {
        "result": "uncertain",
        "summary": "完整性说明",
        "missingMaterials": [],
      },
      "findings": [
        {
          "domain": "采购合规",
          "title": "风险事项标题",
          "riskLevel": "medium",
          "description": "风险事项说明",
          "relatedDocuments": [
            {
              "documentId": "必须来自输入材料的 documentId",
              "fileName": "对应输入材料的 fileName",
            }
          ],
          "recommendation": "整改建议",
        }
      ],
      "limitations": [],
    },
  }

  degraded_example = _build_degraded_output(
    payload,
    "当前环境未检测到可用的 MinerU 或其他文档解析能力，无法可靠读取上传材料正文。",
  )

  return f"""
你是 RiskTrace 采购项目审查智能体。

项目名称：
{project["projectTitle"]}

项目 ID：
{project["projectId"]}

以下是本项目的材料：

{files_text}

请根据每个材料提供的 fileUrl，优先使用当前环境中实际可用的工具读取和解析文件内容。
不要只根据文件名猜测材料正文。

如果 MinerU、文档解析插件、文件下载工具或其他必要解析能力不可用：
1. 不得把“工具不可用”当成任务异常抛出；
2. 不得假装已经读取文件正文；
3. 不得只返回自然语言错误；
4. 必须按下方完整 JSON 结构返回降级结果，并明确说明无法完成实质性审查的原因。

请完成：
1. 材料理解；
2. 材料完整性判断；
3. 采购合规风险审查；
4. 给出整改建议。

字段约束必须严格遵守：

category 只能取以下值之一：
- 采购立项与审批
- 供应商与寻源
- 合同与补充协议
- 订单与执行
- 交付与验收
- 发票与付款
- 其他材料
- 无法判断

completeness.result 只能取：
- complete
- incomplete
- uncertain

overallRiskLevel 和 findings[].riskLevel 只能取：
- low
- medium
- high
- critical

特别注意：
- overallRiskLevel 不能使用 uncertain；无法判断风险时使用 medium，并在 completeness/limitations 中说明不确定性。
- findings 必须是数组。
- findings[].domain 必须是非空字符串，不能是数组、对象或 null。
- findings[].title 必须是非空字符串。
- findings[].description 必须是非空字符串。
- findings[].recommendation 必须是非空字符串。
- findings[].relatedDocuments 必须是数组。
- relatedDocuments[].documentId 必须是字符串。
- relatedDocuments[].fileName 必须是字符串。
- materialAnalysis.materials 必须为数组。
- 每个输入文件都应尽量有一条 materialAnalysis.materials 记录。
- completeness 必须包含 result、summary、missingMaterials。
- missingMaterials 和 limitations 都必须是字符串数组。

正常返回结构示例：
{json.dumps(schema_example, ensure_ascii=False, indent=2)}

当 MinerU/文档解析能力不可用时，返回类似以下完整降级结构：
{json.dumps(degraded_example, ensure_ascii=False, indent=2)}

最终必须只返回一个 JSON 对象。
禁止输出 Markdown。
禁止输出 ```json 代码块。
禁止在 JSON 前后添加解释文字。
""".strip()


def _extract_json_object(text: str) -> dict[str, Any] | None:
  """Parse plain/fenced JSON and tolerate short prose before the JSON object."""
  normalized = text.strip()

  if normalized.startswith("```") and normalized.endswith("```"):
    lines = normalized.splitlines()
    if len(lines) >= 3:
      if lines[0].strip().lower() in {"```", "```json"}:
        normalized = "\n".join(lines[1:-1]).strip()

  try:
    value = json.loads(normalized)
    if isinstance(value, dict):
      return value
  except Exception:
    pass

  decoder = json.JSONDecoder()
  for index, char in enumerate(normalized):
    if char != "{":
      continue
    try:
      value, _ = decoder.raw_decode(normalized[index:])
    except Exception:
      continue
    if isinstance(value, dict):
      return value

  return None


def _normalize_material_analysis(
  raw: Any,
  payload: dict[str, Any],
) -> dict[str, Any]:
  record = raw if isinstance(raw, dict) else {}
  raw_materials = record.get("materials")
  material_items = raw_materials if isinstance(raw_materials, list) else []

  by_document_id: dict[str, dict[str, Any]] = {}
  for item in material_items:
    if not isinstance(item, dict):
      continue
    document_id = item.get("documentId")
    if isinstance(document_id, str) and document_id.strip():
      by_document_id[document_id.strip()] = item

  normalized_materials: list[dict[str, Any]] = []

  for file in payload.get("files", []):
    if not isinstance(file, dict):
      continue

    document_id = _safe_text(file.get("documentId"), "unknown-document", 80)
    file_name = _safe_text(file.get("fileName"), "未知文件", 255)
    item = by_document_id.get(document_id, {})

    normalized_materials.append(
      {
        "documentId": document_id,
        "materialName": _safe_text(
          item.get("materialName"),
          file_name,
          100,
        ),
        "category": _normalize_category(item.get("category")),
        "summary": _safe_text(
          item.get("summary"),
          "审查执行未能可靠识别该文件内容。",
          1000,
        ),
      }
    )

  return {
    "summary": _safe_text(
      record.get("summary"),
      "系统已完成材料记录整理，但部分内容可能未能可靠解析。",
      2000,
    ),
    "materials": normalized_materials,
    "completeness": _normalize_completeness(
      record.get("completeness"),
      default_result="uncertain",
      default_summary="材料完整性暂无法确认。",
    ),
  }


def _normalize_related_documents(
  value: Any,
  payload: dict[str, Any],
) -> list[dict[str, str]]:
  known = {
    _safe_text(file.get("documentId"), "", 80): _safe_text(
      file.get("fileName"),
      "未知文件",
      255,
    )
    for file in payload.get("files", [])
    if isinstance(file, dict)
  }

  if not isinstance(value, list):
    return []

  result: list[dict[str, str]] = []
  seen: set[str] = set()

  for item in value:
    if not isinstance(item, dict):
      continue

    document_id = _safe_text(item.get("documentId"), "", 80)
    if not document_id or document_id in seen:
      continue

    seen.add(document_id)
    result.append(
      {
        "documentId": document_id,
        "fileName": known.get(
          document_id,
          _safe_text(item.get("fileName"), "未知文件", 255),
        ),
      }
    )

  return result


def _normalize_finding(
  raw: Any,
  payload: dict[str, Any],
) -> dict[str, Any]:
  record = raw if isinstance(raw, dict) else {}

  return {
    "domain": _safe_text(
      record.get("domain"),
      "采购合规",
      80,
    ),
    "title": _safe_text(
      record.get("title"),
      "审查事项",
      160,
    ),
    "riskLevel": _normalize_risk_level(
      record.get("riskLevel"),
      default="medium",
    ),
    "description": _safe_text(
      record.get("description"),
      "该事项的详细风险说明未能完整生成。",
      2000,
    ),
    "relatedDocuments": _normalize_related_documents(
      record.get("relatedDocuments"),
      payload,
    ),
    "recommendation": _safe_text(
      record.get("recommendation"),
      "建议人工复核相关材料后再作最终判断。",
      1500,
    ),
  }


def _normalize_final_report(
  raw: Any,
  payload: dict[str, Any],
) -> dict[str, Any]:
  record = raw if isinstance(raw, dict) else {}

  raw_findings = record.get("findings")
  findings_source = raw_findings if isinstance(raw_findings, list) else []

  findings = [
    _normalize_finding(item, payload)
    for item in findings_source[:50]
  ]

  return {
    "summary": _safe_text(
      record.get("summary"),
      "本次审查结果已生成，但部分内容需要人工复核。",
      3000,
    ),
    "overallRiskLevel": _normalize_risk_level(
      record.get("overallRiskLevel"),
      default="medium",
    ),
    "completeness": _normalize_completeness(
      record.get("completeness"),
      default_result="uncertain",
      default_summary="材料完整性暂无法确认。",
    ),
    "findings": findings,
    "limitations": _safe_string_list(
      record.get("limitations"),
      max_items=20,
      max_length=300,
    ),
  }


def _normalize_provider_output(
  value: dict[str, Any],
  payload: dict[str, Any],
) -> dict[str, Any]:
  nested: dict[str, Any] = value

  for key in ("data", "output"):
    candidate = nested.get(key)
    if isinstance(candidate, dict):
      nested = candidate
      break

  raw_material_analysis = (
    nested.get("materialAnalysis")
    if "materialAnalysis" in nested
    else nested.get("material_analysis")
  )
  raw_final_report = (
    nested.get("finalReport")
    if "finalReport" in nested
    else nested.get("final_report", nested.get("report"))
  )

  # 兼容模型直接返回 finalReport 或 materialAnalysis 本体。
  if raw_final_report is None and (
    "overallRiskLevel" in nested or "findings" in nested
  ):
    raw_final_report = nested

  if raw_material_analysis is None and (
    "materials" in nested and "completeness" in nested
  ):
    raw_material_analysis = nested

  # 缺少任何一半结果时也不让 Pages 校验失败，生成保守结构继续完成流程。
  if raw_material_analysis is None:
    raw_material_analysis = {
      "summary": "模型未返回完整的材料理解结果。",
      "materials": [],
      "completeness": {
        "result": "uncertain",
        "summary": "材料理解结果缺失，完整性暂无法确认。",
        "missingMaterials": [],
      },
    }

  if raw_final_report is None:
    degraded = _build_degraded_output(
      payload,
      "模型未返回完整的 finalReport，系统已自动生成降级审查结果。",
    )
    raw_final_report = degraded["finalReport"]

  return {
    "materialAnalysis": _normalize_material_analysis(
      raw_material_analysis,
      payload,
    ),
    "finalReport": _normalize_final_report(
      raw_final_report,
      payload,
    ),
  }


def parse_output(
  text: str,
  payload: dict[str, Any],
) -> dict[str, Any]:
  """
  Convert Harness output into the exact shape expected by RiskTrace Pages.

  This function deliberately degrades instead of throwing when:
  - MinerU/document parsing is unavailable and the model explains it in prose;
  - the model wraps JSON in Markdown or short explanatory text;
  - individual fields have wrong types or unsupported enum values;
  - one of materialAnalysis/finalReport is missing.
  """
  text = (text or "").strip()

  if not text:
    return _build_degraded_output(
      payload,
      "DeepSeek Harness 未返回结果内容，可能是文档解析工具不可用或本次执行未生成最终响应。",
    )

  parsed = _extract_json_object(text)
  if parsed is None:
    return _build_degraded_output(
      payload,
      "模型未返回可解析的 JSON。可能原因包括 MinerU/文档解析工具不可用、文件无法访问，或模型未遵守结构化输出要求。",
      raw_response=text,
    )

  try:
    return _normalize_provider_output(parsed, payload)
  except Exception as exc:
    # 最后一层保险：模型 JSON 即使出现意外结构，也不要让整个 review workflow
    # 因结构化错误而失败。
    return _build_degraded_output(
      payload,
      f"模型结果无法规范化为 RiskTrace 输出结构：{type(exc).__name__}: {exc}",
      raw_response=text,
    )


def _looks_like_document_parser_unavailable(exc: Exception) -> bool:
  message = str(exc).lower()
  keywords = (
    "mineru",
    "document parser",
    "document parsing",
    "parse document",
    "parser unavailable",
    "tool not found",
    "unknown tool",
    "plugin",
  )
  return any(keyword in message for keyword in keywords)


def _normalize_finish_reason(value: Any) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = value.strip().lower()
  return normalized or None


def _new_harness_session_id(prefix: str) -> str:
  """Create a fresh native Harness session for one independent execution.

  RiskTrace review/check IDs are business identifiers and may be reused across
  retries or duplicate HTTP requests. DeepSeek Harness persisted session IDs,
  however, must be fresh for independent tasks when a new runtime process is
  created; otherwise an existing JSONL log can trigger an id-collision error.
  """
  safe_prefix = "".join(
    char if char.isalnum() or char in {"-", "_"} else "-"
    for char in str(prefix)
  ).strip("-_")
  safe_prefix = (safe_prefix or "risktrace")[:80]
  return f"{safe_prefix}-{uuid4().hex}"


def _safe_scalar(value: Any) -> str | int | float | bool | None:
  if isinstance(value, (str, int, float, bool)) or value is None:
    return value
  return None


def _sanitize_llm_failure(value: Any) -> dict[str, Any] | None:
  """
  Keep the provider-neutral fields defined by DeepSeek Harness LlmFailure.

  Do not return arbitrary nested provider payloads, request headers, prompts,
  signed file URLs, or tool arguments from the raw event log.
  """
  if not isinstance(value, dict):
    return None

  result: dict[str, Any] = {}
  for key in (
      "message",
      "code",
      "status",
      "providerRetryAfterMs",
      "requestId",
  ):
    scalar = _safe_scalar(value.get(key))
    if scalar is not None:
      result[key] = scalar

  return result or None


def _sanitize_turn_reason(value: Any) -> dict[str, Any] | None:
  if not isinstance(value, dict):
    return None

  reason: dict[str, Any] = {}
  kind = _safe_scalar(value.get("kind"))
  if kind is not None:
    reason["kind"] = kind

  error = _sanitize_llm_failure(value.get("error"))
  if error:
    reason["error"] = error

  # aborted turn reasons are small typed objects. Preserve only their kind.
  abort_reason = value.get("reason")
  if isinstance(abort_reason, dict):
    abort_kind = _safe_scalar(abort_reason.get("kind"))
    if abort_kind is not None:
      reason["reason"] = {"kind": abort_kind}

  return reason or None


def _extract_last_turn_end(events: list[dict[str, Any]]) -> dict[str, Any] | None:
  for event in reversed(events):
    if not isinstance(event, dict) or event.get("type") != "turn/end":
      continue

    data = event.get("data")
    if not isinstance(data, dict):
      return {"reason": None}

    result: dict[str, Any] = {
      "reason": _sanitize_turn_reason(data.get("reason")),
    }
    turn = _safe_scalar(data.get("turn"))
    if turn is not None:
      result["turn"] = turn
    return result

  return None


def _summarize_event(event: Any) -> dict[str, Any] | None:
  if not isinstance(event, dict):
    return None

  event_type = event.get("type")
  if not isinstance(event_type, str) or not event_type:
    return None

  summary: dict[str, Any] = {"type": event_type}
  data = event.get("data")
  if not isinstance(data, dict):
    return summary

  for key in ("turn", "step", "callId", "name", "kind"):
    scalar = _safe_scalar(data.get(key))
    if scalar is not None:
      summary[key] = scalar

  if event_type == "turn/end":
    summary["reason"] = _sanitize_turn_reason(data.get("reason"))

  # tool/result and some runtime/plugin events may carry a compact error identity.
  error = data.get("error")
  if isinstance(error, dict):
    compact_error: dict[str, Any] = {}
    for key in ("name", "code", "message", "status"):
      scalar = _safe_scalar(error.get(key))
      if scalar is not None:
        compact_error[key] = scalar
    if compact_error:
      summary["error"] = compact_error

  # command/done stores a small success/error kind; omit its free-form text.
  if event_type == "command/done":
    command_kind = _safe_scalar(data.get("kind"))
    if command_kind is not None:
      summary["kind"] = command_kind

  return summary


def _summarize_events(
  events: list[dict[str, Any]],
  *,
  limit: int = 30,
) -> list[dict[str, Any]]:
  summaries: list[dict[str, Any]] = []
  for event in events[-limit:]:
    summary = _summarize_event(event)
    if summary is not None:
      summaries.append(summary)
  return summaries


def _result_diagnostics(result: Any) -> dict[str, Any]:
  events = result.events if isinstance(result.events, list) else []
  session_id = getattr(result, "session_id", None)
  return {
    "sessionId": session_id if isinstance(session_id, str) else None,
    "finishReason": _normalize_finish_reason(result.finish_reason),
    "eventCount": len(events),
    "lastTurnEnd": _extract_last_turn_end(events),
    "eventSummary": _summarize_events(events),
  }


def _last_harness_error(diagnostics: dict[str, Any]) -> dict[str, Any] | None:
  last_turn_end = diagnostics.get("lastTurnEnd")
  if not isinstance(last_turn_end, dict):
    return None
  reason = last_turn_end.get("reason")
  if not isinstance(reason, dict):
    return None
  return _sanitize_llm_failure(reason.get("error"))


def _format_harness_error_message(
  harness_error: dict[str, Any] | None,
) -> str:
  if not harness_error:
    return "DeepSeek Harness execution failed"

  code = harness_error.get("code")
  message = harness_error.get("message")

  if isinstance(code, str) and code and isinstance(message, str) and message:
    return f"DeepSeek Harness execution failed [{code}]: {message}"
  if isinstance(message, str) and message:
    return f"DeepSeek Harness execution failed: {message}"
  if isinstance(code, str) and code:
    return f"DeepSeek Harness execution failed [{code}]"
  return "DeepSeek Harness execution failed"


def run_review_detailed(
  payload: dict[str, Any],
  run_id: str,
  on_notification: Callable[[Any], None] | None = None,
) -> dict[str, Any]:
  """Run a review and keep the official SDK result metadata for API diagnostics."""

  prompt = build_prompt(payload)

  api_key = None
  if settings.deepseek_api_key is not None:
    api_key = settings.deepseek_api_key.get_secret_value()

  # A RiskTrace reviewRunId is a durable business identifier, not a native
  # DeepSeek Harness session identifier. Each /runs execution creates a new
  # runtime process, so reusing run_id as session_id can collide with the
  # persisted JSONL session left by an earlier execution/retry.
  harness_session_id = _new_harness_session_id(run_id)

  try:
    with DeepSeekHarness(
      provider=settings.harness_provider,
      model=settings.harness_model,
      cwd=str(settings.harness_workspace),
      session_root=str(settings.harness_session_root),
      api_key=api_key,
      base_url=settings.deepseek_base_url,
    ) as harness:

      result = harness.run(
        prompt,
        session_id=harness_session_id,
        on_notification=on_notification,
      )
  except Exception as exc:
    # Preserve the existing product behavior for explicitly recognized document
    # parser/tool availability failures: return a valid degraded RiskTrace result.
    if _looks_like_document_parser_unavailable(exc):
      return {
        "output": _build_degraded_output(
          payload,
          f"文档解析工具不可用：{type(exc).__name__}: {exc}",
        ),
        "finalResponse": "",
        "harness": {
          "sessionId": harness_session_id,
          "finishReason": "degraded",
          "eventCount": 0,
          "lastTurnEnd": None,
          "eventSummary": [],
          "degraded": True,
          "exceptionType": type(exc).__name__,
          "exceptionMessage": str(exc),
        },
      }

    raise HarnessExecutionError(
      f"DeepSeek Harness runtime exception [{type(exc).__name__}]: {exc}",
      finish_reason="error",
      final_response="",
      event_count=0,
      last_turn_end=None,
      event_summary=[],
      exception_type=type(exc).__name__,
      session_id=harness_session_id,
    ) from exc

  diagnostics = _result_diagnostics(result)
  finish_reason = diagnostics["finishReason"]
  final_response = result.final_response or ""

  if finish_reason == "error":
    harness_error = _last_harness_error(diagnostics)
    raise HarnessExecutionError(
      _format_harness_error_message(harness_error),
      finish_reason=finish_reason,
      final_response=final_response,
      harness_error=harness_error,
      event_count=diagnostics["eventCount"],
      last_turn_end=diagnostics["lastTurnEnd"],
      event_summary=diagnostics["eventSummary"],
      session_id=diagnostics["sessionId"] or harness_session_id,
    )

  return {
    "output": parse_output(final_response, payload),
    "finalResponse": final_response,
    "harness": diagnostics,
  }


def run_review(
  payload: dict[str, Any],
  run_id: str,
) -> dict[str, Any]:
  """Backward-compatible helper that returns only the normalized RiskTrace output."""
  return run_review_detailed(payload, run_id)["output"]




def _diagnostic_timestamp() -> str:
  return datetime.now(timezone.utc).isoformat()


def _harness_sdk_version() -> str:
  try:
    return version("deepseek-harness-sdk")
  except PackageNotFoundError:
    return "unknown"


def run_harness_diagnostic(check_id: str) -> dict[str, Any]:
  """Run a minimal synchronous Harness call for end-to-end provider diagnostics."""
  started_at = time.perf_counter()
  logs: list[dict[str, Any]] = []

  def log(
    level: str,
    message: str,
    details: dict[str, Any] | None = None,
  ) -> None:
    entry: dict[str, Any] = {
      "timestamp": _diagnostic_timestamp(),
      "level": level,
      "layer": "harness",
      "message": message,
    }
    if details is not None:
      entry["details"] = details
    logs.append(entry)

  api_key = None
  if settings.deepseek_api_key is not None:
    api_key = settings.deepseek_api_key.get_secret_value()

  diagnostic_session_id = _new_harness_session_id(f"diagnostic-{check_id}")

  log(
    "info",
    "准备启动 DeepSeek Harness SDK",
    {
      "provider": settings.harness_provider,
      "model": settings.harness_model,
      "sdkVersion": _harness_sdk_version(),
      "deepseekApiKeyConfigured": bool(api_key),
      "deepseekBaseUrlConfigured": bool(settings.deepseek_base_url),
      "sessionId": diagnostic_session_id,
    },
  )

  try:
    with DeepSeekHarness(
      provider=settings.harness_provider,
      model=settings.harness_model,
      cwd=str(settings.harness_workspace),
      session_root=str(settings.harness_session_root),
      api_key=api_key,
      base_url=settings.deepseek_base_url,
    ) as harness:
      log("success", "DeepSeek Harness runtime 已启动")
      run_started_at = time.perf_counter()
      result = harness.run(
        "这是 RiskTrace Provider 连通性检查。请只回复 RISKTRACE_HARNESS_OK，不要添加其他内容。",
        session_id=diagnostic_session_id,
      )
      run_duration_ms = round((time.perf_counter() - run_started_at) * 1000)

    finish_reason = str(result.finish_reason)
    normalized_finish_reason = _normalize_finish_reason(result.finish_reason)
    final_response = result.final_response or ""
    normalized_final_response = final_response.strip()
    response_preview = final_response[:1000]
    expected_response = "RISKTRACE_HARNESS_OK"
    expected_response_matched = normalized_final_response == expected_response
    diagnostics = _result_diagnostics(result)
    harness_error = _last_harness_error(diagnostics)
    ok = (
      normalized_finish_reason == "completed"
      and bool(normalized_final_response)
      and expected_response_matched
    )

    log(
      "success" if ok else "error",
      "DeepSeek Harness 模型调用已返回" if ok else "DeepSeek Harness 模型调用未成功返回",
      {
        "sessionId": diagnostics["sessionId"] or diagnostic_session_id,
        "finishReason": finish_reason,
        "runDurationMs": run_duration_ms,
        "responseLength": len(final_response),
        "responsePreview": response_preview,
        "expectedResponseMatched": expected_response_matched,
        "harnessError": harness_error,
        "lastTurnEnd": diagnostics["lastTurnEnd"],
        "eventCount": diagnostics["eventCount"],
      },
    )

    return {
      "ok": ok,
      "provider": settings.harness_provider,
      "model": settings.harness_model,
      "sdkVersion": _harness_sdk_version(),
      "sessionId": diagnostics["sessionId"] or diagnostic_session_id,
      "finishReason": finish_reason,
      "response": response_preview,
      "finalResponse": final_response,
      "expectedResponseMatched": expected_response_matched,
      "harnessError": harness_error,
      "lastTurnEnd": diagnostics["lastTurnEnd"],
      "eventCount": diagnostics["eventCount"],
      "eventSummary": diagnostics["eventSummary"],
      "durationMs": round((time.perf_counter() - started_at) * 1000),
      "logs": logs,
    }
  except Exception as exc:
    log(
      "error",
      "DeepSeek Harness 诊断调用抛出异常",
      {
        "errorType": type(exc).__name__,
        "errorMessage": str(exc),
      },
    )
    return {
      "ok": False,
      "provider": settings.harness_provider,
      "model": settings.harness_model,
      "sdkVersion": _harness_sdk_version(),
      "sessionId": diagnostic_session_id,
      "finishReason": "error",
      "response": "",
      "finalResponse": "",
      "expectedResponseMatched": False,
      "harnessError": None,
      "lastTurnEnd": None,
      "eventCount": 0,
      "eventSummary": [],
      "durationMs": round((time.perf_counter() - started_at) * 1000),
      "logs": logs,
    }
