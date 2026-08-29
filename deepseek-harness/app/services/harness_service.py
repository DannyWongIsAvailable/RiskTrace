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
    events: list[dict[str, Any]] | None = None,
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
    self.events = events or []

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
  file_count = len(files)

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

  if file_count <= 1:
    orchestration_hint = (
      "当前仅有 1 份材料。默认由主 Agent 完成，不要为了展示多智能体而调用 subagent；"
      "只有在材料本身很长、存在明显可独立拆分的专项审查任务时，才允许委派 1 个聚焦 subagent。"
    )
  elif file_count <= 5:
    orchestration_hint = (
      f"当前共有 {file_count} 份材料。解析后若形成 2 个及以上相对独立的审查工作流，"
      "优先使用 1-2 个 subagent 并行专项审查；若材料高度同质或必须顺序依赖，则由主 Agent 直接完成。"
    )
  else:
    orchestration_hint = (
      f"当前共有 {file_count} 份材料，属于多材料项目。解析后若形成 3 个及以上彼此独立的审查工作流，"
      "本次任务明确允许使用 workflow 进行大型并行编排；若只有 1-2 个独立工作流，仍优先直接调用 subagent。"
    )

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
          "description": (
            "已确认事实：...；异常/偏差：...；风险影响：...；"
            "如仍需补证，写明待核验事项。"
          ),
          "relatedDocuments": [
            {
              "documentId": "必须来自输入材料的 documentId",
              "fileName": "对应输入材料的 fileName",
            }
          ],
          "recommendation": (
            "给出可执行动作；必要时明确补充证据、人工复核、暂停流程或升级审批。"
          ),
        }
      ],
      "limitations": [],
    },
  }

  degraded_example = _build_degraded_output(
    payload,
    "当前环境未检测到可用的 MinerU 或其他文档解析能力，无法可靠读取上传材料正文。",
  )

  subagent_result_contract = {
    "scope": "本子任务审查范围",
    "confirmedFacts": [
      {
        "fact": "只写从材料正文确认的事实",
        "documentIds": ["输入材料 documentId"],
      }
    ],
    "candidateFindings": [
      {
        "title": "候选风险标题",
        "riskLevelSuggestion": "low|medium|high|critical",
        "reason": "事实、偏差和潜在影响",
        "documentIds": ["输入材料 documentId"],
        "needsVerification": True,
      }
    ],
    "missingEvidence": [],
    "crossChecks": [],
    "limitations": [],
  }

  return f"""
你是 RiskTrace 的企业采购与供应链合规审查主 Agent（Orchestrator / Lead Reviewer）。

你的职责不是对单份文件做摘要，也不是机械调用工具，而是针对一个完整采购项目，自主完成：材料解析、事实抽取、证据组织、跨材料核验、风险识别、合规研判、风险分级和处置建议。必要时，你可以调用 subagent；在大型且可并行的项目中，本次任务也明确允许调用 workflow 进行多智能体编排。

【最高优先级原则】
- 事实优先，证据驱动；结论必须能够回到实际读取的材料。
- 先解析、后分工、再研判；不要在读取正文前根据文件名推断业务事实。
- 子智能体是“分析器”，不是“证据源”。subagent/workflow 的返回只能作为候选分析，主 Agent 必须回到已解析材料事实进行复核后才能形成最终 finding。
- 不确定性必须显式表达。缺少材料、无法核验、无法确定，不等同于已发生违规。
- 禁止编造金额、日期、主体、制度条款、法律依据、交易事实或不存在的材料。
- 不为了展示多智能体而制造无意义委派；能由主 Agent 清晰完成的简单任务直接完成。

项目名称：
{project["projectTitle"]}

项目 ID：
{project["projectId"]}

输入材料数量：{file_count}

以下是本项目的材料：

{files_text}

【第一阶段：材料解析与证据底座】

1. 对每份需要读取正文的材料，优先加载并使用 MinerU skill，以输入中的原始 fileUrl 解析文件。
2. fileUrl 可直接传给 MinerU Gateway；不得为了审查主动把源文件下载到本地，不得根据文件名猜正文。
3. 同一 fileUrl 在一次审查中原则上只解析一次；避免无意义重复调用。
4. MinerU 返回后，先在你的工作上下文中形成紧凑的“证据账本”，至少识别：
   - documentId / fileName；
   - 材料类型与采购业务阶段；
   - 主体、项目号/合同号/订单号/发票号等业务标识；
   - 日期、金额、数量、账户、税率、付款条件、交付/验收状态等关键事实；
   - 材料明确写出的异常、例外、缺件、限制或审批信息；
   - 无法可靠识别的字段和 OCR 不确定项。
5. 后续所有 subagent、workflow 和最终 finding 都应基于该证据底座，不得把子智能体自己的推断当作新事实。

如果 MinerU 或必要文档解析能力不可用，无法可靠读取材料正文时，不得继续假装完成实质性审查；必须按下方完整 JSON 结构返回降级结果，并明确限制。

【第二阶段：动态智能体编排】

初始编排提示：{orchestration_hint}

你必须在材料解析后，根据真实内容重新判断复杂度，而不是仅按文件数量机械分工。

A. 默认不使用 subagent 的情况：
- 单一简单材料；
- 风险判断只依赖一个短链路；
- 子任务之间高度依赖，拆分会造成重复解析或丢失上下文；
- 主 Agent 已能直接完成并保持证据可追溯。

B. 适合使用 1-2 个 subagent 的情况：
- 存在两个相对独立的专业审查域；
- 需要把聚焦分析从主上下文中卸载；
- 例如“供应商/寻源审查”与“合同条款审查”，或“履约交付审查”与“发票付款审查”。

C. 适合使用 workflow 的情况：
- 解析后至少形成 3 个彼此相对独立、可并行的审查工作流；
- 材料较多、跨多个采购阶段，并且并行能明显减少主 Agent 串行处理负担；
- 本次 RiskTrace 审查已明确授权大型多智能体编排，因此满足上述条件时可使用 workflow；
- 对 1-2 个委派任务，优先普通 subagent，不要滥用 workflow。

【推荐的专项角色池】
只选择实际需要的角色，不要求全部调用：

1. Supplier & Sourcing Reviewer（供应商与寻源）
   - 供应商主体、资质、准入、账户、关联关系、寻源流程异常。

2. Contract Reviewer（合同与控制条款）
   - 合同主体、金额、标的、付款条件、交付验收、违约责任、变更与补充协议。

3. Transaction & Performance Reviewer（订单/履约/发票/付款）
   - 订单数量与金额、到货、验收、发票、付款之间的一致性、时序和控制缺口。

4. Evidence Challenger（证据一致性挑战者）
   - 专门寻找跨材料矛盾、证据不足、OCR 误读可能性、把“缺材料”误判成“违规”的问题。
   - 该角色用于复杂项目或已出现明显冲突时，不要每次固定调用。

5. Risk Judge（风险研判复核）
   - 仅在候选风险较多、等级存在争议或证据链复杂时使用；对候选 finding 做证据充分性和等级校准，不重新发明事实。

【subagent 委派规则】

subagent 是独立上下文，不会自动看到主 Agent 当前对话。每次调用必须给它一个完整、自包含的任务说明，至少包括：
- 项目名称和项目 ID；
- 本子任务负责的审查范围；
- 相关 documentId / fileName；
- 主 Agent 已从 MinerU 解析确认的必要事实摘要；
- 需要进行的具体核验；
- 证据约束、禁止事项；
- 要求返回结构化、精简的结果。

不要让多个 subagent 对同一范围做重复工作，除非是明确的“挑战/复核”任务。
不要要求 subagent 管理 systemd、修改服务配置、探测基础设施或修复生产环境。

建议要求 subagent 返回以下紧凑 JSON 结构，不要让子智能体直接生成最终 RiskTrace JSON：
{subagent_result_contract}

主 Agent 收到 subagent/workflow 结果后必须执行：
1. 将返回的 confirmedFacts 与主 Agent 已解析材料逐项对照；
2. 删除没有原始材料支持的候选事实或风险；
3. 合并重复风险；
4. 对冲突判断选择证据更强的一方，无法确定则写入 limitations / missingMaterials；
5. 主 Agent 对最终 overallRiskLevel 和 findings 承担唯一责任。

【Todo / 运行计划】

如果 todo_write 工具可用，开始实质性审查前必须建立本次审查计划。

Todo 要求：
- 根据当前项目真实材料动态生成，不得机械复制固定模板；
- 以业务阶段/审查工作流为粒度，通常 4-8 项即可；
- 不要为每个文件创建一个 Todo；
- 如果使用 subagent/workflow，可把“专项审查汇总”作为 Todo，但不要把每一次工具调用单独列为 Todo；
- 完成关键审查阶段后及时更新；
- 最终输出前确保可完成任务均已完成。

【第三阶段：跨材料核验】

不要孤立审查材料。根据实际材料重点检查：
- 主体：供应商、采购方、开票方、收款方是否一致或有合理依据；
- 标识：项目号、合同号、订单号、发票号是否可关联；
- 金额：立项/合同/订单/发票/付款金额及币种、税额是否匹配；
- 数量：订单、到货、验收、发票数量是否匹配；
- 日期：立项、审批、签约、下单、到货、验收、开票、付款的时序是否合理；
- 条件：合同付款条件是否与实际付款节点一致；
- 账户：合同约定账户、供应商账户、变更通知、实际付款账户是否一致；
- 流程：审批链、变更审批、验收依据、付款审批是否完整；
- 供应商：资质、经营信息、账户和交易行为是否存在需复核的异常信号。

【第四阶段：Evidence → Finding】

每个 finding 必须满足：
1. 至少有一项从实际材料中确认的事实；
2. 明确说明异常/偏差是什么；
3. 明确说明为什么会形成业务或合规风险；
4. relatedDocuments 只引用真正支持该 finding 的输入材料；
5. recommendation 必须可执行。

对于跨材料矛盾类 finding，原则上应引用至少两份相互关联的材料；对于单材料即可确认的风险（例如材料正文明确记载缺件、明显缺失关键条款），可以只引用一份材料。

不得仅因为某材料未上传，就直接认定业务违法违规。材料不足应优先进入 completeness.missingMaterials 或 limitations；只有材料中已有事实足以形成明确控制风险时，才输出 finding。

finding.description 建议按以下逻辑组织，但仍输出一个字符串：
“已确认事实：...；异常/偏差：...；风险影响：...；待核验：...”
如果无需待核验，可以省略最后一段。

finding.recommendation 应尽量包含：
- 立即动作（如补证、人工复核、暂停付款、重新验收、升级审批）；
- 需要补充的证据或责任角色；
- 在什么条件满足后可以解除风险。

【第五阶段：材料完整性与证据充分度】

completeness 不只是“文件是否上传齐全”，还要表达是否足以支持当前项目级结论：
- complete：关键业务链路材料基本齐全，足以完成主要跨材料核验；
- incomplete：存在明确缺失的关键材料，影响一项或多项重要核验；
- uncertain：无法判断是否应当存在某类材料，或现有信息不足以判断完整性。

missingMaterials 应写具体业务材料名称，如“采购订单”“合同/补充协议”“验收记录”“付款申请/银行回单”，不要写抽象描述。

【风险等级】

low：轻微规范性问题，一般整改即可解决，未见明显关键控制失效。
medium：存在明确流程缺口、控制偏差或需要人工确认的实质异常。
high：存在有充分证据支持的重大经济风险、明显违规或关键控制失效，应升级处理。
critical：存在有充分证据支持的重大违法违规、重大损失风险或系统性控制失效，需要立即阻断/处置。

证据不足时不得为了“保守”自动升高风险等级。风险等级应由已确认事实决定，不确定性通过 completeness / limitations 表达。

【最终输出前强制自检】

返回 JSON 前必须检查：
- 是否读取并覆盖全部输入材料，未成功解析的材料是否明确说明；
- 是否把文件名推测当成正文事实；
- 是否遗漏明显跨材料主体、金额、数量、日期、账户或流程矛盾；
- 每条 finding 是否至少有实际证据支持；
- subagent/workflow 的候选结论是否已由主 Agent 对照原材料复核；
- 是否存在仅凭“缺少材料”就认定违规的 finding；
- riskLevel 是否与证据强度匹配；
- recommendation 是否具体可执行；
- 所有 relatedDocuments.documentId 是否来自输入材料；
- 输出是否严格符合 RiskTrace JSON Schema。

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
- overallRiskLevel 不能使用 uncertain。
- 如果没有足够事实支持实质风险，可以返回较低风险等级甚至 findings=[]；不要为了填充结果制造 finding。
- findings 必须是数组。
- findings[].domain 必须是非空字符串，不能是数组、对象或 null。
- findings[].title 必须是非空字符串。
- findings[].description 必须是非空字符串。
- findings[].recommendation 必须是非空字符串。
- findings[].relatedDocuments 必须是数组。
- relatedDocuments[].documentId 必须是字符串，且必须来自输入材料。
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

  # A completed Harness turn must still satisfy the RiskTrace result contract.
  # Do not manufacture a successful business result in the gateway: if a tool is
  # unavailable the Agent may explicitly return the degraded schema from the prompt.
  if raw_material_analysis is None:
    raise ValueError("Harness output is missing materialAnalysis")
  if raw_final_report is None:
    raise ValueError("Harness output is missing finalReport")

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
  """Parse an explicitly completed Harness response without inventing a success result."""
  text = (text or "").strip()
  if not text:
    raise ValueError("DeepSeek Harness completed without a final response")

  parsed = _extract_json_object(text)
  if parsed is None:
    raise ValueError("DeepSeek Harness final response is not a JSON object")

  return _normalize_provider_output(parsed, payload)


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
      cordis=settings.harness_cordis,
    ) as harness:

      result = harness.run(
        prompt,
        session_id=harness_session_id,
        on_notification=on_notification,
      )
  except Exception as exc:
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
  events = [event for event in result.events if isinstance(event, dict)] if isinstance(result.events, list) else []

  # The SDK exposes the root turn/end reason directly. Only an explicitly completed
  # turn is a successful RiskTrace execution; max-tokens/aborted/blocked/interrupted
  # remain real Harness terminal states instead of being normalized into success.
  if finish_reason != "completed":
    harness_error = _last_harness_error(diagnostics)
    if finish_reason == "error":
      message = _format_harness_error_message(harness_error)
    else:
      message = f"DeepSeek Harness turn ended with finish reason: {finish_reason or 'unknown'}"
    raise HarnessExecutionError(
      message,
      finish_reason=finish_reason,
      final_response=final_response,
      harness_error=harness_error,
      event_count=diagnostics["eventCount"],
      last_turn_end=diagnostics["lastTurnEnd"],
      event_summary=diagnostics["eventSummary"],
      session_id=diagnostics["sessionId"] or harness_session_id,
      events=events,
    )

  try:
    output = parse_output(final_response, payload)
  except Exception as exc:
    raise HarnessExecutionError(
      f"DeepSeek Harness completed but returned invalid RiskTrace output: {exc}",
      finish_reason=finish_reason,
      final_response=final_response,
      event_count=diagnostics["eventCount"],
      last_turn_end=diagnostics["lastTurnEnd"],
      event_summary=diagnostics["eventSummary"],
      session_id=diagnostics["sessionId"] or harness_session_id,
      events=events,
    ) from exc

  return {
    "output": output,
    "finalResponse": final_response,
    "harness": diagnostics,
    "events": events,
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
