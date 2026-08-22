from __future__ import annotations

import json
from typing import Any

from deepseek_harness import DeepSeekHarness

from app.core.config import settings


def build_prompt(payload):
    return '只回复下面这个 JSON，不要输出任何其他内容：{"materialAnalysis":{},"finalReport":{}}'


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