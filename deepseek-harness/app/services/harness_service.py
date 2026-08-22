from __future__ import annotations

import json
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
""".strip()


def parse_output(text: str) -> dict[str, Any]:
    text = text.strip()

    # 防止模型偶尔仍然套 Markdown
    if text.startswith("```json"):
        text = text[7:].strip()
    elif text.startswith("```"):
        text = text[3:].strip()

    if text.endswith("```"):
        text = text[:-3].strip()

    result = json.loads(text)

    if not isinstance(result, dict):
        raise ValueError("Harness 返回值不是 JSON object")

    if "materialAnalysis" not in result:
        raise ValueError("Harness 返回值缺少 materialAnalysis")

    if "finalReport" not in result:
        raise ValueError("Harness 返回值缺少 finalReport")

    return result


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
