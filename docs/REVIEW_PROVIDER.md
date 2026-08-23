# RiskTrace Review Provider 接入规范

## 1. 当前阶段目标：统一同步审查

RiskTrace 当前阶段明确采用**同步 Review Provider**：

```text
页面上传并确认全部材料
→ POST /api/projects/:projectId/uploads/complete
→ Pages Functions 调用一次 ReviewProvider.createRun()
→ Provider 在同一个 HTTP 请求内完成材料理解、领域审查和报告聚合
→ Provider 返回终态 succeeded / failed / interrupted
→ RiskTrace 校验并落库 materialAnalysis + finalReport
→ /uploads/complete 返回 completed / failed
→ 页面继续展示最终结果
```

当前阶段不实现：

- Provider 状态轮询；
- `getRun(executeId)`；
- `cancelRun(executeId)`；
- 前端定时请求 `/review` 等待 Provider 变化；
- DeepSeek Harness `GET /runs/{id}`；
- 外部工作流回调。

`GET /api/projects/:projectId/review` 仅查询 RiskTrace D1 中已经持久化的审查状态，不访问任何 Provider。

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

## 3. 稳定同步接口

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

Provider 只实现：

```ts
createRun(input): Promise<ProviderRun>
```

返回：

```ts
interface ProviderRun {
  executeId: string
  result: {
    state: 'succeeded' | 'interrupted' | 'failed'
    content?: string
    providerMessage?: string
  }
}
```

`executeId` 在当前同步阶段只作为 Provider 调用追踪 ID 保存，不用于后续状态查询。

Provider 不允许返回 `running`。如果外部服务只返回 queued/running 等非终态，适配器必须将其视为当前同步契约不支持的响应，而不是要求 RiskTrace 开始轮询。

### 3.1 最终输出契约

当 Provider 返回 `succeeded` 时，`content` 必须能解析为同时包含以下字段的 JSON：

```json
{
  "materialAnalysis": {},
  "finalReport": {}
}
```

RiskTrace 会先完整校验两部分，再保存正式结果；任一部分缺失或不符合 Schema，整个审查按 `WORKFLOW_OUTPUT_INVALID` 失败，不保存半成品结果。

## 4. 数据库存储

现有 `review_runs.provider_execute_id` 字段暂时保留，避免为了同步切换增加数据库迁移。

当前语义为：

```text
provider_name       = 本次同步调用使用的 Provider
provider_execute_id = Provider 返回的请求/运行追踪 ID，仅用于审计与定位
provider_status     = pending / starting / success / failed / interrupt
```

新的同步主链不会把 `provider_status` 切换为 `running`，也不会根据 `provider_execute_id` 查询 Provider。

失败后显式重试会清空旧 Provider 绑定，然后重新执行一次完整同步调用。

## 5. 讯飞星辰同步配置

```text
REVIEW_PROVIDER=xingchen
XFYUN_API_BASE_URL=https://xingchen-api.xf-yun.com
XFYUN_API_KEY=...
XFYUN_API_SECRET=...
XFYUN_FLOW_ID_REVIEW=...
```

RiskTrace 使用：

```text
POST /workflow/v1/chat/completions
stream=false
```

该请求必须在返回前完成整条 Workflow，并从 `choices[0].delta.content` 返回最终业务结果。

工作流开始节点接收：

```text
AGENT_USER_INPUT
PROJECT_ID
REVIEW_RUN_ID
PROJECT_TITLE
FILES_JSON
ATTEMPT_NO
```

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

## 6. DeepSeek Harness 同步配置

```text
REVIEW_PROVIDER=deepseek-harness
DEEPSEEK_HARNESS_BASE_URL=https://your-harness.example.com
DEEPSEEK_HARNESS_API_KEY=...
```

`DEEPSEEK_HARNESS_API_KEY` 可为空；为空时不发送 `Authorization`。

RiskTrace 只调用：

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

FastAPI `/runs` 必须同步等待 Harness 完成，并在同一个响应中返回终态。例如：

```json
{
  "runId": "review_xxx",
  "status": "completed",
  "output": {
    "materialAnalysis": {},
    "finalReport": {}
  }
}
```

运行编号兼容读取：

```text
executeId
execute_id
runId
run_id
id
```

终态映射：

```text
success / succeeded / completed / complete -> succeeded
interrupt / interrupted / requires_action  -> interrupted
failed / error / cancelled / canceled      -> failed
```

以下状态在当前同步契约中属于无效响应：

```text
queued / pending / starting / running / in_progress
```

RiskTrace 不调用：

```text
GET  /runs/{id}
POST /runs/{id}/cancel
```

## 7. 页面与 API 行为

`POST /api/projects/:projectId/uploads/complete`：

- HTTP 请求保持打开直到同步审查结束；
- 正常完成后返回 HTTP 200 + `status=completed`；
- Provider 返回业务失败终态时返回 HTTP 200 + `status=failed` 和结构化 `error`；
- Provider 网络、超时、无效响应等基础设施异常仍按统一错误协议返回 4xx/5xx；
- 响应中不再提供 `pollUrl`。

前端在等待期间只展示本地“同步审查执行中”状态，不启动定时器，不请求 `/review`。

`GET /api/projects/:projectId/review` 仅用于页面刷新、排障或显式读取已经持久化的审查状态。

## 8. 结果保存原则

同步 Provider 返回后，RiskTrace 在同一次服务端请求中完成：

```text
读取最终 content
→ 解析 materialAnalysis + finalReport
→ 同时完成两部分 Schema 校验
→ 保存 material_analysis
→ 更新 project_documents 的材料分类/摘要
→ 保存 final_report
→ reviewRun/project 更新为 completed / report_completed
→ 返回 /uploads/complete
```

## 9. 新增 Provider

新增 Provider 时：

1. 在 `review-provider.ts` 增加 Provider 名称；
2. 新建一个实现 `ReviewProvider` 的同步适配器；
3. 在 `review-provider-factory.ts` 注册；
4. 保证 `createRun()` 返回终态；
5. 保证成功输出同时包含 `materialAnalysis` 和 `finalReport`；
6. 不在页面或业务服务中新增供应商专有轮询逻辑。
