# RiskTrace 后端 MVP 部署与接口说明

本后端实现严格遵循 `Demo应用设计方案.md` 的单工作流约束：一个采购项目最多维护一个 `review_runs` 记录；一次审查只维护一个当前有效的讯飞星辰 `executeId`；材料理解结果和最终报告分别保存，但属于同一次审查运行。

## 1. 已实现范围

- D1 数据模型与首个迁移；
- 项目创建、项目列表和项目详情接口；
- R2 私有文件直传签名、上传确认和文件列表接口；
- 上传批次完成后自动启动一条讯飞星辰异步工作流；
- 同一 `executeId` 的轮询同步、阶段回调、失败和最多三次尝试；
- 材料理解结果与最终报告的字段、枚举、长度、文件归属和去重校验；
- 结果幂等写入 D1，可选原始工作流输出写入私有 R2；
- 统一业务错误、请求编号、结构化日志和健康检查。

当前没有修改任何 Vue 页面或前端业务调用。

## 2. 数据库

迁移文件：

```text
migrations/0001_backend_mvp.sql
```

核心表：

| 表 | 用途 |
|---|---|
| `projects` | 采购项目及当前业务状态 |
| `project_documents` | 文件登记、R2 Key、上传状态和材料理解字段 |
| `review_runs` | 单工作流审查运行、当前 `executeId`、阶段、进度和重试次数 |
| `review_results` | 材料理解和最终报告 JSON 快照 |

应用本地迁移：

```bash
pnpm db:migrate:local
```

应用远程迁移：

```bash
pnpm db:migrate:remote
```

## 3. R2 配置

`wrangler.jsonc` 已加入：

```json
{
  "vars": {
    "R2_BUCKET_NAME": "risktrace-files"
  },
  "r2_buckets": [
    {
      "binding": "risktrace_files",
      "bucket_name": "risktrace-files"
    }
  ]
}
```

尚未创建桶时执行：

```bash
pnpm wrangler r2 bucket create risktrace-files
```

浏览器直接 PUT 到预签名 URL 前，必须为桶配置 CORS。示例文件为 `docs/r2-cors.example.json`。部署到自定义域名时，请把域名加入 `allowed.origins`，然后执行：

```bash
pnpm r2:cors:apply
pnpm r2:cors:list
```

上传 URL 会签入 `Content-Type`；调用方必须原样携带接口返回的全部 `headers`。请求提供 `checksumSha256` 时，后端还会签入并校验 `x-amz-checksum-sha256`。

## 4. 环境变量与密钥

普通变量已在 `wrangler.jsonc` 中声明：

```text
APP_NAME
APP_ENV
XFYUN_API_BASE_URL
R2_BUCKET_NAME
```

生产环境写入以下 Secrets：

```bash
pnpm wrangler secret put XFYUN_API_KEY
pnpm wrangler secret put XFYUN_API_SECRET
pnpm wrangler secret put XFYUN_FLOW_ID_REVIEW
pnpm wrangler secret put RISKTRACE_CALLBACK_TOKEN
pnpm wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm wrangler secret put R2_ACCESS_KEY_ID
pnpm wrangler secret put R2_SECRET_ACCESS_KEY
```

说明：

- `RISKTRACE_CALLBACK_TOKEN` 请使用足够长的随机字符串；
- `R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY` 来自有目标桶读写权限的 R2 S3 API Token；
- 本地联调时将相同字段写入未提交的 `.dev.vars`；
- 不要把密钥写入 `wrangler.jsonc`、前端环境变量或日志。

## 5. 讯飞星辰工作流输入契约

后端通过异步工作流接口启动一次执行，并向工作流 `parameters` 注入以下字符串变量：

| 变量 | 内容 |
|---|---|
| `PROJECT_ID` | 项目 ID |
| `REVIEW_RUN_ID` | 审查运行 ID |
| `PROJECT_TITLE` | 项目标题 |
| `FILES_JSON` | 文件对象数组 JSON 字符串 |
| `CALLBACK_URL` | RiskTrace 内部回调地址 |
| `CALLBACK_TOKEN` | 回调鉴权 Token |
| `AGENT_USER_INPUT` | 汇总后的完整输入 JSON 字符串 |

`FILES_JSON` 中每个文件对象包含：

```json
{
  "documentId": "doc_xxx",
  "fileName": "采购合同.pdf",
  "mimeType": "application/pdf",
  "fileUrl": "短时有效的私有 R2 GET URL",
  "parseStrategy": "ocr"
}
```

`parseStrategy` 可能为 `ocr`、`table` 或 `text`。

### 材料理解完成回调

工作流完成材料理解后，应在同一执行继续运行，并调用：

```text
POST /internal/provider/xingchen-callback
X-RiskTrace-Callback-Token: <CALLBACK_TOKEN>
Content-Type: application/json
```

请求体示例：

```json
{
  "reviewRunId": "review_xxx",
  "executeId": "星辰 execute_id",
  "stage": "domain_review_running",
  "materialAnalysis": {
    "summary": "项目材料概述",
    "materials": [
      {
        "documentId": "doc_xxx",
        "materialName": "采购合同",
        "category": "合同与补充协议",
        "summary": "文件摘要"
      }
    ],
    "completeness": {
      "result": "incomplete",
      "summary": "缺少验收证明",
      "missingMaterials": ["验收证明"]
    }
  }
}
```

允许的业务阶段：

```text
material_analysis_running
material_analysis_completed
domain_review_running
report_aggregating
report_completed
failed
```

迟到回调不会把已完成或已失败的运行重新打开，较早阶段也不会覆盖较晚阶段。

### 最终报告输出

推荐在异步执行的最终 `output.content` 返回以下 JSON 对象：

```json
{
  "finalReport": {
    "summary": "总体审查结论",
    "overallRiskLevel": "high",
    "completeness": {
      "result": "incomplete",
      "summary": "缺少验收证明",
      "missingMaterials": ["验收证明"]
    },
    "findings": [
      {
        "domain": "合同合规",
        "title": "付款条件缺少验收前置约束",
        "riskLevel": "high",
        "description": "风险说明",
        "relatedDocuments": [
          { "documentId": "doc_xxx" }
        ],
        "recommendation": "补充验收合格后付款条款"
      }
    ],
    "limitations": []
  }
}
```

也可以在一次最终回调中提交 `finalReport`。最终报告保存前，系统要求同一运行已经保存材料理解结果。

模型输出中的 `projectTitle`、`fileName`、`findingId`、状态和阶段不会被直接信任：这些字段由后端覆盖或生成。引用不存在或不属于当前项目的 `documentId` 会被拒绝。

## 6. 对外 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | D1、R2 和工作流配置状态 |
| `POST` | `/api/projects` | 创建项目，请求体 `{ "projectTitle": "..." }` |
| `GET` | `/api/projects?page=1&pageSize=20` | 项目列表 |
| `GET` | `/api/projects/:projectId` | 项目、文件和审查运行详情 |
| `POST` | `/api/projects/:projectId/upload-sessions` | 登记文件并生成 R2 PUT URL |
| `POST` | `/api/projects/:projectId/documents/:documentId/complete` | 校验 R2 对象并确认单文件上传 |
| `GET` | `/api/projects/:projectId/documents` | 文件列表 |
| `POST` | `/api/projects/:projectId/uploads/complete` | 完成上传批次并自动启动审查 |
| `GET` | `/api/projects/:projectId/review` | 同步并返回审查状态 |
| `POST` | `/api/projects/:projectId/review/retry` | 重试失败运行，最多三次尝试 |
| `GET` | `/api/projects/:projectId/material-analysis` | 获取已保存的材料理解结果 |
| `GET` | `/api/projects/:projectId/report` | 获取最终报告 |

### 创建上传会话

请求：

```json
{
  "files": [
    {
      "fileName": "采购合同.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1048576,
      "checksumSha256": "可选的 64 位十六进制 SHA-256"
    }
  ]
}
```

限制：

- 每项目最多 30 个文件；
- 单文件最大 50 MiB；
- 每项目登记材料总大小最大 200 MiB；
- 支持 PDF、常见图片、Office、CSV、TXT、Markdown 和 JSON；
- ZIP、RAR、7z、tar、gz 必须先解压。

浏览器上传顺序：

```text
POST upload-sessions
→ 对每个文件使用返回的 uploadUrl、method、headers 直接 PUT
→ POST documents/:documentId/complete
→ 所有文件确认后 POST uploads/complete
```

## 7. 状态机和幂等

```text
draft / waiting_for_upload
→ uploading / uploading_files
→ reviewing / material_analysis_running
→ reviewing / material_analysis_completed
→ reviewing / domain_review_running
→ reviewing / report_aggregating
→ completed / report_completed
```

失败进入：

```text
failed / failed
```

关键约束：

- `review_runs.project_id` 唯一，因此每个项目只有一个审查运行；
- 同一运行只保存一个当前有效的 `provider_execute_id`；
- 重试清空旧 `executeId` 后在原运行记录上启动新执行；
- 旧执行回调因 `executeId` 不匹配而被拒绝；
- `review_results` 以 `(review_run_id, result_type)` 唯一，重复回调执行幂等更新；
- 已完成或已失败运行是终态，不被迟到回调重新打开。

## 8. 上线前检查

```bash
pnpm install
pnpm type-check:functions
pnpm db:migrate:remote
pnpm r2:cors:apply
pnpm cf:deploy
```

部署后至少验证：

```text
GET /api/health
创建项目
生成上传 URL
PUT 一个小文件并确认上传
启动审查
轮询 review
读取 material-analysis
读取 report
```
