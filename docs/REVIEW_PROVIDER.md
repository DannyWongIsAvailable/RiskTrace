# RiskTrace Review Provider 接入规范

## 1. 目标

RiskTrace 对外 REST API、前端调用和结果 Schema 不感知底层审查执行平台。后端业务编排只依赖：

```text
functions/_shared/review-provider.ts
```

具体平台通过 Provider 实现接入：

```text
ReviewProvider
├─ XingchenReviewProvider
└─ DeepSeekHarnessReviewProvider
```

Demo Mock 仍由现有 Mock 审查服务提供，但入口同样由 `REVIEW_PROVIDER` 统一选择。

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

默认值为 `mock`，因此现有 Demo 在不增加任何外部密钥时仍可运行。

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
  callback: {
    url: string
    token: string
  }
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

## 4. 运行时 Provider 绑定

`review_runs` 新增：

```text
provider_name
```

一次运行启动时保存：

```text
provider_name + provider_execute_id
```

后续轮询使用该运行保存的 Provider，而不是重新读取当前默认 Provider。这样可以安全地完成以下部署切换：

```text
旧运行：xingchen + execute_xxx     -> 继续查询 Xingchen
新运行：deepseek-harness + run_xxx -> 使用 DeepSeek Harness
```

失败后显式重试会清空旧 Provider 绑定，并使用重试时的 `REVIEW_PROVIDER`，因此可以用另一 Provider 重跑。

部署新代码前必须应用：

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
RISKTRACE_CALLBACK_TOKEN=...
```

星辰专有的：

```text
flow_id
uid
chat_id
PROJECT_ID
REVIEW_RUN_ID
PROJECT_TITLE
FILES_JSON
CALLBACK_URL
CALLBACK_TOKEN
AGENT_USER_INPUT
```

全部封装在：

```text
functions/_shared/xingchen-provider.ts
```

`review-service.ts` 不再感知这些字段。

## 6. DeepSeek Harness 配置

DeepSeek Harness 被视为独立 Agent Runtime，而不是直接把原始 DeepSeek Chat API 写进业务层。

配置：

```text
REVIEW_PROVIDER=deepseek-harness
DEEPSEEK_HARNESS_BASE_URL=https://your-harness.example.com
DEEPSEEK_HARNESS_API_KEY=...
RISKTRACE_CALLBACK_TOKEN=...
```

`DEEPSEEK_HARNESS_API_KEY` 可为空；为空时不发送 `Authorization`。

### 6.1 创建运行

RiskTrace 调用：

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
  "files": [],
  "callback": {
    "url": "https://risktrace.example.com/internal/provider/callback",
    "headers": {
      "X-RiskTrace-Callback-Token": "..."
    }
  }
}
```

创建响应的运行编号支持以下任一字段：

```text
executeId
execute_id
runId
run_id
id
```

推荐：

```json
{
  "runId": "run_xxx",
  "status": "running"
}
```

### 6.2 查询运行

```http
GET {DEEPSEEK_HARNESS_BASE_URL}/runs/{executeId}
```

推荐响应：

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

支持的状态映射：

```text
queued / pending / starting / running / in_progress -> running
success / succeeded / completed / complete          -> succeeded
interrupt / interrupted / requires_action           -> interrupted
failed / error / cancelled / canceled                -> failed
```

`output` 也可直接返回 JSON 字符串。最终仍由 RiskTrace 的 `review-result-validation.ts` 校验，Harness 不具备直接写正式结果的权限。

### 6.3 取消运行

```http
POST {DEEPSEEK_HARNESS_BASE_URL}/runs/{executeId}/cancel
```

## 7. 通用回调

新 Provider 使用：

```http
POST /internal/provider/callback
X-RiskTrace-Callback-Token: <RISKTRACE_CALLBACK_TOKEN>
```

请求：

```json
{
  "reviewRunId": "review_xxx",
  "executeId": "run_xxx",
  "stage": "material_analysis_completed",
  "materialAnalysis": {}
}
```

最终结果：

```json
{
  "reviewRunId": "review_xxx",
  "executeId": "run_xxx",
  "stage": "report_completed",
  "finalReport": {}
}
```

失败：

```json
{
  "reviewRunId": "review_xxx",
  "executeId": "run_xxx",
  "stage": "failed",
  "failure": {
    "code": "HARNESS_EXECUTION_FAILED",
    "message": "安全的错误描述"
  }
}
```

旧的：

```text
/internal/provider/xingchen-callback
```

继续保留为兼容别名，现有星辰工作流不需要立即修改。

## 8. 新增第三个 Provider

新增 Provider 时只需要：

1. 在 `review-provider.ts` 增加 Provider 名称；
2. 新建一个实现 `ReviewProvider` 的适配器；
3. 在 `review-provider-factory.ts` 注册实现；
4. 如需新增持久化枚举值，增加 D1 migration；
5. 不修改 `/api/projects/...` 路由、前端 API 模块、结果 Schema 和页面。

供应商差异必须停留在 Provider 层。
