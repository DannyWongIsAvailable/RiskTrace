# RiskTrace Review Provider 接入规范

## 1. 目标

RiskTrace 对外 REST API、前端调用和结果 Schema 不感知底层审查执行平台。后端业务编排只依赖：

```text
functions/_shared/review-provider.ts
```

具体平台通过 Provider 实现接入：

```text
ReviewProvider
├─ MockReviewProvider
├─ XingchenReviewProvider
└─ DeepSeekHarnessReviewProvider
```

所有 Provider 都遵循同一原则：**一次审查只启动一个执行实例，工作流内部完成全部分析，RiskTrace 只通过运行结果查询取得最终输出，不使用工作流回调。**

## 2. Provider 选择

使用环境变量：

```text
REVIEW_PROVIDER=mock
REVIEW_PROVIDER=xingchen
REVIEW_PROVIDER=deepseek-harness
```

兼容别名：

```text
xfyun            -> xingchen
deepseek         -> deepseek-harness
deepseek_harness -> deepseek-harness
```

默认值为 `mock`。

## 3. 稳定业务接口

`ReviewProvider` 接收统一输入：

```ts
interface CreateReviewRunInput {
  projectId: string
  reviewRunId: string
  projectTitle: string
  files: Array<{
    documentId: string
    fileName: string
    mimeType: string
    fileUrl: string
    parseStrategy: 'ocr' | 'table' | 'text'
  }>
}
```

Provider 必须实现：

```ts
createRun(input)
getRun(executeId)
cancelRun(executeId)
```

并将平台状态归一化为：

```text
running
succeeded
interrupted
failed
```

业务层不允许构造供应商专有参数名、鉴权头或 endpoint。

### 3.1 最终输出契约

当 Provider 返回 `succeeded` 时，`content` 必须能解析为同时包含以下两个字段的 JSON：

```json
{
  "materialAnalysis": {},
  "finalReport": {}
}
```

RiskTrace 会先同时校验两部分，再保存正式结果；任一部分缺失或不符合 Schema，整个审查按 `WORKFLOW_OUTPUT_INVALID` 失败，不保存半成品结果。

Provider 处于 `running` 时，即使第三方平台暴露部分输出，RiskTrace 也不会把它写入正式结果。

## 4. 运行时 Provider 绑定

一次运行启动时保存：

```text
provider_name + provider_execute_id
```

后续 `GET /api/projects/:projectId/review` 会根据运行中持久化的 `provider_name` 创建对应 Provider，并使用同一个 `provider_execute_id` 查询执行状态。切换默认 Provider 不会影响已经启动的运行。

失败后显式重试会清空旧 Provider 绑定，并使用重试时的 `REVIEW_PROVIDER` 重新启动同一条完整审查链路。

部署前仍需应用：

```text
migrations/0002_review_provider.sql
```

## 5. 讯飞星辰配置

```text
REVIEW_PROVIDER=xingchen
XFYUN_API_BASE_URL=https://xingchen-api.xf-yun.com
XFYUN_API_KEY=...
XFYUN_API_SECRET=...
XFYUN_FLOW_ID_REVIEW=...
```

星辰专有字段全部封装在：

```text
functions/_shared/xingchen-provider.ts
```

工作流开始节点接收：

```text
AGENT_USER_INPUT
PROJECT_ID
REVIEW_RUN_ID
PROJECT_TITLE
FILES_JSON
ATTEMPT_NO
```

RiskTrace 调用：

```text
POST /workflow/v1/async/chat/completions
→ 保存 execute_id
→ POST /workflow/v1/async/chat/result
→ Running：归一化为 ProviderRunResult { state: 'running' }
→ Success：严格读取 data.output.content 字符串
→ 将 content 归一化为 ProviderRunResult { state: 'succeeded', content }
→ review-service 再 JSON.parse(content) 并校验业务结果
```

星辰异步结果接口成功时的供应商响应 envelope 按以下结构处理：

```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "status": "Success",
    "output": {
      "content": "{\"materialAnalysis\":{...},\"finalReport\":{...}}",
      "reasoning_content": ""
    },
    "usage": {}
  }
}
```

`XingchenReviewProvider` 不把整个供应商响应交给业务层，也不假设 `data.output` 直接包含 RiskTrace 字段；它只负责读取 `data.status` 与 `data.output.content`，转换成统一的 `ProviderRunResult`。`content` 必须是字符串，空字符串、缺少 `data.output` 或非字符串 `content` 都按 Provider 执行失败处理。

星辰 End 节点必须一次性输出：

```json
{
  "materialAnalysis": {
    "summary": "...",
    "materials": [],
    "completeness": {}
  },
  "finalReport": {
    "summary": "...",
    "overallRiskLevel": "low",
    "completeness": {},
    "findings": [],
    "limitations": []
  }
}
```

工作流内部可以有任意数量的材料理解、领域 Agent 和聚合节点，但不要再配置 RiskTrace 材料分类回调或最终报告回调节点。

## 6. DeepSeek Harness 配置

```text
REVIEW_PROVIDER=deepseek-harness
DEEPSEEK_HARNESS_BASE_URL=https://your-harness.example.com
DEEPSEEK_HARNESS_API_KEY=...
```

`DEEPSEEK_HARNESS_API_KEY` 可为空；为空时不发送 `Authorization`。

### 6.1 创建运行

```http
POST {DEEPSEEK_HARNESS_BASE_URL}/runs
Authorization: Bearer <DEEPSEEK_HARNESS_API_KEY>
Content-Type: application/json
```

请求：

```json
{
  "contract": "risktrace.review.v1",
  "idempotencyKey": "review_xxx",
  "project": {
    "projectId": "project_xxx",
    "reviewRunId": "review_xxx",
    "projectTitle": "采购项目标题"
  },
  "files": []
}
```

创建响应的运行编号支持：

```text
executeId
execute_id
runId
run_id
id
```

### 6.2 查询运行

```http
GET {DEEPSEEK_HARNESS_BASE_URL}/runs/{executeId}
```

推荐成功响应：

```json
{
  "runId": "run_xxx",
  "status": "completed",
  "output": {
    "materialAnalysis": {},
    "finalReport": {}
  }
}
```

状态映射：

```text
queued / pending / starting / running / in_progress -> running
success / succeeded / completed / complete          -> succeeded
interrupt / interrupted / requires_action           -> interrupted
failed / error / cancelled / canceled                -> failed
```

`output` 也可直接返回 JSON 字符串，最终仍由 `review-result-validation.ts` 校验。

### 6.3 取消运行

```http
POST {DEEPSEEK_HARNESS_BASE_URL}/runs/{executeId}/cancel
```

## 7. 结果保存原则

工作流成功后，RiskTrace 在一次同步处理中完成：

```text
读取最终 content
→ 解析 materialAnalysis + finalReport
→ 同时完成两部分 Schema 校验
→ 保存 material_analysis
→ 更新 project_documents 的材料分类/摘要
→ 保存 final_report
→ reviewRun/project 更新为 completed / report_completed
```

不再存在 `/internal/provider/callback` 或 `/internal/provider/xingchen-callback` 接口，也不再接受外部工作流主动写入审查结果。

## 8. 新增 Provider

新增 Provider 时只需要：

1. 在 `review-provider.ts` 增加 Provider 名称；
2. 新建一个实现 `ReviewProvider` 的适配器；
3. 在 `review-provider-factory.ts` 注册实现；
4. 如需新增持久化枚举值，增加 D1 migration；
5. 保证 `succeeded` 最终输出同时包含 `materialAnalysis` 和 `finalReport`；
6. 不修改业务 API、前端 API 模块或页面来适配供应商差异。

供应商差异必须停留在 Provider 层。
