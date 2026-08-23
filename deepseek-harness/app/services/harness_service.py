from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from deepseek_harness import DeepSeekHarness

from app.core.config import settings


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

    return f"""
你是 RiskTrace 采购项目审查智能体。

项目名称：
{project["projectTitle"]}

项目 ID：
{project["projectId"]}

以下是本项目的材料：

{files_text}

请根据每个材料提供的 fileUrl，使用你已有的工具实际读取和解析文件内容。
文件读取、解析以及 MinerU 工具调用全部由你自行完成。

不要只根据文件名判断材料内容。

请完成：
1. 材料理解；
2. 材料完整性判断；
3. 采购合规风险审查；
4. 给出整改建议。

category字段必须严格从以下枚举中选择：
[
  '采购立项与审批',
  '供应商与寻源',
  '合同与补充协议',
  '订单与执行',
  '交付与验收',
  '发票与付款',
  '其他材料',
  '无法判断',
]
最终必须只返回 JSON，不要输出 Markdown，不要输出 ```json 标记。

返回结构：

{{
  "materialAnalysis": {{
    "summary": "材料总体情况",
    "materials": [
      {{
        "documentId": "输入中的 documentId",
        "materialName": "材料名称",
        "category": "材料分类",
        "summary": "材料摘要"
      }}
    ],
    "completeness": {{
      "result": "complete",
      "summary": "完整性说明",
      "missingMaterials": []
    }}
  }},
  "finalReport": {{
    "summary": "项目总体审查结论",
    "overallRiskLevel": "low",
    "completeness": {{
      "result": "complete",
      "summary": "完整性说明",
      "missingMaterials": []
    }},
    "findings": [],
    "limitations": []
  }}
}}
重要降级规则：

如果无法调用 MinerU 或任何文档解析工具：

1. 不允许输出自然语言说明。
2. 必须仍然输出完整 JSON。
3. 在 findings 中增加 system 类型风险。

格式：

{
    "overallRiskLevel":"uncertain",
 "summary":"无法完成材料解析",
 "findings":[
   {
    "domain":"document-processing",
    "title":"MinerU解析服务不可用",
    "riskLevel":"medium",
    "description":"当前环境未检测到可用文档解析工具，因此无法读取上传材料。",
    "recommendation":"部署MinerU服务或配置文档解析插件后重新执行审查。",
    "relatedDocuments":[]
   }
 ],
 "completeness":{
    "result":"uncertain",
    "reason":"缺少文档解析能力"
 }
}

禁止输出 Markdown。
禁止输出解释文字。
禁止输出代码块。
""".strip()


def parse_output(text: str) -> dict:
  text = text.strip()

  try:
    return json.loads(text)

  except Exception:

    return {
      "overallRiskLevel": "uncertain",

      "summary": (
        "审查未完成结构化分析。"
        "模型返回内容无法解析为标准 JSON。"
      ),

      "findings": [
        {
          "domain": "system",
          "title": "文档解析能力不可用",
          "riskLevel": "medium",
          "description": text[:1000],
          "recommendation": (
            "请检查 MinerU 文档解析服务是否可用，"
            "或重新上传可解析文件。"
          ),
          "relatedDocuments": []
        }
      ],

      "completeness": {
        "result": "uncertain",
        "reason": (
          "无法完成完整材料解析，"
          "原因是模型输出无法转换为结构化结果。"
        )
      }
    }


def run_review(
    payload: dict[str, Any],
    run_id: str,
) -> dict[str, Any]:

    prompt = build_prompt(payload)

    api_key = None
    if settings.deepseek_api_key is not None:
        api_key = settings.deepseek_api_key.get_secret_value()

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
            session_id=run_id,
        )

    if result.finish_reason == "error":
        raise RuntimeError(
            "DeepSeek Harness execution failed"
        )

    if not result.final_response:
        raise RuntimeError(
            "DeepSeek Harness returned empty response"
        )

    return parse_output(result.final_response)


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

    log(
        "info",
        "准备启动 DeepSeek Harness SDK",
        {
            "provider": settings.harness_provider,
            "model": settings.harness_model,
            "sdkVersion": _harness_sdk_version(),
            "deepseekApiKeyConfigured": bool(api_key),
            "deepseekBaseUrlConfigured": bool(settings.deepseek_base_url),
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
                session_id=f"diagnostic-{check_id}",
            )
            run_duration_ms = round((time.perf_counter() - run_started_at) * 1000)

        finish_reason = str(result.finish_reason)
        normalized_finish_reason = finish_reason.strip().lower()
        final_response = (result.final_response or "").strip()
        response_preview = final_response[:1000]
        expected_response = "RISKTRACE_HARNESS_OK"
        expected_response_matched = final_response == expected_response
        ok = (
            normalized_finish_reason == "completed"
            and bool(final_response)
            and expected_response_matched
        )

        log(
            "success" if ok else "error",
            "DeepSeek Harness 模型调用已返回" if ok else "DeepSeek Harness 模型调用未成功返回",
            {
                "finishReason": finish_reason,
                "runDurationMs": run_duration_ms,
                "responseLength": len(final_response),
                "responsePreview": response_preview,
                "expectedResponseMatched": expected_response_matched,
            },
        )

        return {
            "ok": ok,
            "provider": settings.harness_provider,
            "model": settings.harness_model,
            "sdkVersion": _harness_sdk_version(),
            "finishReason": finish_reason,
            "response": response_preview,
            "expectedResponseMatched": expected_response_matched,
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
            "finishReason": "error",
            "response": "",
            "expectedResponseMatched": False,
            "durationMs": round((time.perf_counter() - started_at) * 1000),
            "logs": logs,
        }
