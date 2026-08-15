# RiskTrace Demo 应用设计方案

## 1. 文档目的

RiskTrace 是面向企业采购项目的智能合规审查 Demo。本版本只验证一条最短业务闭环：

```text
项目标题
→ 一次性上传全部已有材料
→ 自动材料理解
→ 自动完整性检查
→ 自动领域审查
→ 自动聚合报告
→ 只读展示结果
```

当前 Demo 不建设人工确认、风险处置、规则中心、复杂权限和外部商业数据闭环。

---

## 2. 核心产品约束

1. 顶层业务对象统一称为“采购项目”。
2. 创建项目时只填写项目标题。
3. 用户一次选择并上传当前已有的全部材料。
4. 用户无需手工分类材料，也无需确认 AI 的材料理解结果。
5. 一次审查只维护一个 `review_runs` 记录。
6. 正式环境一次审查只启动一条讯飞星辰工作流。
7. 材料理解、领域路由、领域审查和报告聚合属于同一次工作流执行。
8. 前端不得直接访问 D1、R2 或讯飞星辰。
9. 模型输出必须经过 RiskTrace 后端校验后才能写入 D1。
10. 最终报告为只读结果，不在当前 Demo 中继续做风险处置闭环。

---

## 3. Demo 模式与正式模式

本项目明确区分两种运行模式。

### 3.1 Demo Mock 模式

Demo Mock 用于前端演示和接口联调。

Mock 的请求和响应字段尽量贴近讯飞星辰 Workflow 异步 API：

```json
{
  "flow_id": "mock-risktrace-review",
  "uid": "project_xxx",
  "parameters": {
    "PROJECT_ID": "project_xxx",
    "REVIEW_RUN_ID": "review_xxx",
    "PROJECT_TITLE": "海岳精密设备采购付款审查",
    "FILES_JSON": "[]"
  }
}
```

返回：

```json
{
  "code": 0,
  "message": "Success",
  "id": "mock_sid_xxx",
  "data": {
    "execute_id": "mock_execute_xxx",
    "status": "success",
    "output": {
      "content": {
        "materialAnalysis": {},
        "finalReport": {}
      }
    }
  }
}
```

这里与正式星辰有一个**有意的 Demo 差异**：

- 正式星辰异步接口启动后只返回执行标识，结果随后通过工作流回调或异步结果查询获得；
- Demo Mock 在同一次服务端调用中直接生成 `materialAnalysis` 与 `finalReport`；
- 因此 Demo Mock **不需要前端轮询，也不需要 Mock result 查询接口**；
- Mock 的 `execute_id` 仍然生成并保存，用于保持数据库、日志和正式接入结构一致；
- `GET /api/projects/:projectId/review` 只读取当前 D1 状态，不负责推动 Mock 状态变化。

Mock 不是一个“定时推进状态的假工作流”，而是一个**同步完成、星辰形状的测试替身**。

### 3.2 正式讯飞星辰模式

正式模式使用讯飞星辰 Workflow Open API。

```text
RiskTrace
→ POST /workflow/v1/async/chat/completions
→ 星辰返回 execute_id
→ RiskTrace 保存 provider_execute_id
→ 同一条工作流完成材料理解
→ 工作流 POST 材料理解结果到 RiskTrace
→ 同一条工作流继续领域审查
→ 聚合 Agent 生成最终报告
→ 工作流 POST 最终报告到 RiskTrace
→ End 节点仍输出 finalReport，作为服务端同步/兜底来源
```

正式模式可以由服务端使用 `execute_id` 查询星辰异步执行结果做异常兜底；这不是 Demo 前端必须承担的轮询机制。

---

## 4. 系统架构

```text
Vue 3 Web
    │
    │ REST API
    ▼
Cloudflare Pages Functions
    ├─ D1
    │   ├─ projects
    │   ├─ project_documents
    │   ├─ review_runs
    │   └─ review_results
    │
    ├─ R2
    │   └─ 原始采购材料
    │
    └─ Review Provider
        ├─ Demo：Xingchen-shaped Mock（同步完成）
        └─ 正式：讯飞星辰单工作流（异步执行）
```

前端只依赖 RiskTrace API，不感知底层是 Mock 还是真实星辰。

---

## 5. 数据模型

### 5.1 projects

保存采购项目及当前业务状态。

建议状态：

```text
draft
uploading
reviewing
completed
failed
```

### 5.2 project_documents

保存：

- `documentId`
- `projectId`
- 原始文件名
- MIME Type
- 文件大小
- R2 Key
- 上传状态
- AI 识别材料名称
- AI 分类
- AI 摘要
- checksum

### 5.3 review_runs

一个项目最多一个审查运行：

```text
review_runs.project_id UNIQUE
```

关键字段：

```text
id
project_id
status
stage
provider_execute_id
provider_status
progress
attempt_count
error_code
error_message
started_at
finished_at
updated_at
```

正式模式下 `provider_execute_id` 保存星辰返回的 `execute_id`。

Mock 模式下保存：

```text
mock_execute_<uuid>
```

以保证前后端数据结构不因 Provider 改变。

### 5.4 review_results

同一次运行只维护两类业务结果：

```text
material_analysis
final_report
```

唯一约束：

```text
(review_run_id, result_type)
```

重复写入必须幂等。

---

## 6. 上传链路

```text
POST /api/projects
→ POST /api/projects/:projectId/upload-sessions
→ 浏览器直接 PUT 私有 R2
→ POST /api/projects/:projectId/documents/:documentId/complete
→ 所有文件完成后 POST /api/projects/:projectId/uploads/complete
```

`uploads/complete` 是审查启动边界。

---

## 7. Demo Mock 的正确行为

`POST /api/projects/:projectId/uploads/complete` 在 Demo 模式下应完成：

```text
1. 校验项目和全部文件上传完成
2. 创建或复用 reviewRun
3. 生成星辰风格 Mock 请求
4. 调用 Xingchen-shaped Mock
5. 获得 mock execute_id
6. 校验并保存 MaterialAnalysis
7. 更新 project_documents 的材料理解字段
8. 校验并保存 FinalReport
9. 将 reviewRun 更新为 completed/report_completed
10. 将 project 更新为 completed/report_completed
11. 一次响应返回最终状态和结果摘要
```

整个过程在同一个后端请求中完成。

不再采用：

```text
上传完成
→ Mock 先保存材料分类
→ 前端不断 GET review
→ 每次 GET 推动 Mock 进入下一阶段
→ 再生成最终报告
```

`GET review` 不应包含任何“读取即推进状态”的副作用。

---

## 8. Demo Mock Provider 契约

建议 Mock Provider 接收与正式 Provider 接近的参数：

```ts
interface CreateReviewRunInput {
  projectId: string
  reviewRunId: string
  parameters: Record<string, unknown>
}
```

内部转换为星辰形状：

```json
{
  "flow_id": "mock-risktrace-review",
  "uid": "project_xxx",
  "parameters": {
    "PROJECT_ID": "project_xxx",
    "REVIEW_RUN_ID": "review_xxx",
    "PROJECT_TITLE": "项目标题",
    "FILES_JSON": "[...]",
    "AGENT_USER_INPUT": "{...}"
  }
}
```

Demo Mock 返回：

```json
{
  "code": 0,
  "message": "Success",
  "id": "mock_sid_xxx",
  "data": {
    "execute_id": "mock_execute_xxx",
    "status": "success",
    "output": {
      "content": {
        "materialAnalysis": {},
        "finalReport": {}
      }
    }
  }
}
```

此处 `status` 和 `output` 是 RiskTrace Demo 为消除轮询而增加的同步完成信息，不应误认为正式星辰启动接口一定返回这些字段。

---

## 9. 正式星辰工作流输入

正式工作流开始节点至少接收：

```text
PROJECT_ID
REVIEW_RUN_ID
PROJECT_TITLE
FILES / FILES_JSON
AGENT_USER_INPUT
```

如果需要防止重试后的迟到回调覆盖当前运行，应额外传入由 RiskTrace 生成的本次尝试标识，例如：

```text
ATTEMPT_NO
```

不要要求星辰工作流内部必须知道 `execute_id`。

`execute_id` 是 RiskTrace 调用异步启动接口成功后由星辰返回、再由 RiskTrace 保存的 Provider 执行标识。

---

## 10. 材料理解结果

正式数据契约：

```json
{
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
```

后端必须：

- 校验 `documentId` 属于当前项目；
- 使用数据库真实文件名，不信任模型篡改的文件名；
- 校验类别、字符串长度和枚举；
- 幂等写入 `review_results`；
- 更新 `project_documents.material_name/category/summary`。

---

## 11. 多 Agent 审查

正式工作流：

```text
材料理解
→ 路由 Agent
→ 适用领域 Agent
→ 聚合 Agent
```

建议领域：

```text
采购审批
合同与供应商
履约与验收
发票与付款
```

当前 Demo 不要求所有领域都必须产生风险事项。

---

## 12. 最终报告

```json
{
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
```

后端不信任模型返回的：

```text
projectTitle
fileName
findingId
系统 status
系统 stage
```

这些字段由 RiskTrace 数据库覆盖或由后端生成。

---

## 13. 正式工作流回调

正式环境可以继续使用：

```text
POST /internal/provider/xingchen-callback
```

当前 Demo 为降低星辰自定义插件接入复杂度，回调接口**不做额外 Token 鉴权**。工作流只需要提交业务回调 JSON，不需要配置 `X-RiskTrace-Callback-Token`。

材料理解回调：

```json
{
  "reviewRunId": "review_xxx",
  "stage": "material_analysis_completed",
  "materialAnalysis": {}
}
```

最终报告回调：

```json
{
  "reviewRunId": "review_xxx",
  "stage": "report_completed",
  "finalReport": {}
}
```

`executeId` 为可选字段。星辰 Workflow 内部不需要知道异步启动后才返回给 RiskTrace 的 `execute_id`；如果其他 Provider 能提供 `executeId`，后端仍会校验它是否属于当前有效执行。

为方便星辰大模型 `text` 输出直接接插件，`materialAnalysis` 与 `finalReport` 在当前 Demo 中既可以提交 JSON 对象，也可以提交包含合法 JSON 的字符串；后端会先解析再执行正式 Schema 校验。

`provider_execute_id` 仍由 RiskTrace 保存，用于 Provider 状态同步和故障排查。

> 该无鉴权回调仅用于当前演示 Demo。若后续部署为真实业务系统，应重新启用回调鉴权或其他可信调用机制。

---

## 14. 对外 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/dashboard/summary` | Dashboard 项目、报告与风险统计 |
| POST | `/api/projects` | 创建采购项目 |
| GET | `/api/projects` | 项目列表 |
| GET | `/api/projects/:projectId` | 项目详情 |
| POST | `/api/projects/:projectId/upload-sessions` | 生成 R2 上传 URL |
| POST | `/api/projects/:projectId/documents/:documentId/complete` | 确认单文件上传 |
| GET | `/api/projects/:projectId/documents` | 文件列表 |
| POST | `/api/projects/:projectId/uploads/complete` | 完成上传并启动/完成 Demo 审查 |
| GET | `/api/projects/:projectId/review` | 只读获取审查状态 |
| POST | `/api/projects/:projectId/review/retry` | 正式/失败场景重试 |
| GET | `/api/projects/:projectId/material-analysis` | 材料理解结果 |
| GET | `/api/projects/:projectId/report` | 最终报告 |

### Demo 前端调用方式

Demo 模式：

```text
POST uploads/complete
→ 成功后直接读取返回结果
→ 必要时 GET material-analysis / report
→ 不启动定时轮询
```

页面刷新后：

```text
GET project
GET material-analysis
GET report
```

用于恢复已落库状态。

---

## 15. 状态机

正式模式：

```text
draft / waiting_for_upload
→ uploading / uploading_files
→ reviewing / material_analysis_running
→ reviewing / material_analysis_completed
→ reviewing / domain_review_running
→ reviewing / report_aggregating
→ completed / report_completed
```

Demo Mock 可以在一次请求中依次写入这些阶段，但对前端最终可见的正常终态为：

```text
completed / report_completed
```

失败：

```text
failed / failed
```

---

## 16. 幂等与重试

- `review_runs.project_id` 唯一；
- 一个项目只有一个审查运行；
- 正式模式同一时刻只维护一个当前有效 `provider_execute_id`；
- `attempt_count` 标识当前尝试；
- 重试不会新建第二个 `review_runs`；
- `review_results` 以 `(review_run_id, result_type)` 唯一；
- 同类结果重复提交执行幂等更新；
- 已完成运行不因迟到回调重新打开；
- Demo Mock 重复调用 `uploads/complete` 时，应返回已有完成结果，而不是重复创建第二条运行。

---

## 17. 黄金演示案例

项目标题：

**海岳精密设备采购付款审查**

一次性上传：

1. 采购申请；
2. 预算审批单；
3. 供应商资料；
4. 比价或定标材料；
5. 采购合同；
6. 采购订单；
7. 到货验收单；
8. 发票；
9. 付款申请。

预设问题：

- 合同要求安装调试并稳定运行 30 天，但只提供到货验收单；
- 付款申请中的收款账户与供应商资料不一致；
- 付款申请金额高于当前材料能够证明的验收金额。

演示路径：

```text
1. 输入项目标题
2. 一次性选择全部材料
3. 查看上传进度
4. 上传完成后一次提交
5. 直接展示自动分类、摘要和完整性
6. 直接进入已完成的报告结果
7. 查看风险事项和关联文件
```

Demo 模式不展示“为了等待 Mock 自己变化而轮询”的过程动画。

---

## 18. 开发顺序

### 阶段 1：项目与上传

- 项目创建；
- 批量选择文件；
- R2 预签名 PUT；
- 单文件上传确认；
- 上传批次完成。

### 阶段 2：Xingchen-shaped Mock

- 使用与星辰接近的 `flow_id / uid / parameters` 输入；
- 返回 `code / message / id / data.execute_id`；
- 同一次 Mock 调用直接返回材料分析和最终报告；
- 结果校验并落 D1；
- 前端取消 Mock 轮询。

### 阶段 3：真实星辰工作流

- 一条工作流；
- 材料理解节点；
- 路由 Agent；
- 4 个领域 Agent；
- 聚合 Agent；
- 两次 RiskTrace 回调；
- End 输出 finalReport。

### 阶段 4：异常与重试

- `attempt_count`；
- 迟到回调拒绝；
- Provider 状态兜底；
- 失败重试；
- 页面刷新恢复。

### 阶段 5：演示打磨

- 固定黄金案例；
- 控制文件大小和页数；
- 优化文案；
- 隐藏未完成模块和调试信息。

---

## 19. 验收清单

### 项目与上传

- [ ] 创建项目只填写标题；
- [ ] 一次选择全部材料；
- [ ] 用户无需手工分类；
- [ ] 文件直接上传私有 R2；
- [ ] 每份文件有独立 `documentId` 和 R2 Key。

### Demo Mock

- [ ] Mock 请求字段贴近星辰 Workflow；
- [ ] Mock 返回 `code/message/id/data.execute_id`；
- [ ] Mock 一次调用生成 MaterialAnalysis；
- [ ] Mock 一次调用生成 ReviewReport；
- [ ] Mock 结果经过正式 Schema 校验；
- [ ] Mock 结果幂等写入 D1；
- [ ] `GET review` 没有推进 Mock 状态的副作用；
- [ ] 前端 Demo 不使用定时轮询。

### 正式星辰

- [ ] 一个审查运行只启动一条工作流；
- [ ] 星辰返回的 `execute_id` 保存到 `provider_execute_id`；
- [ ] 材料理解通过同一执行实例回调；
- [ ] 同一执行继续领域审查和聚合；
- [ ] 最终报告回调并落库；
- [ ] End 节点保留 finalReport 输出作为兜底；
- [ ] 旧 attempt 回调不会覆盖当前运行。

### 前端

- [ ] 展示稳定的材料分类与完整性结果；
- [ ] 展示只读报告；
- [ ] 页面刷新可从 D1 恢复结果；
- [ ] 不展示模型私有思维链；
- [ ] 不包含处置中心和规则中心。

---

## 20. 官方能力口径

讯飞星辰 Workflow 正式异步调用采用：

```text
POST /workflow/v1/async/chat/completions
```

核心请求字段包括：

```text
flow_id
uid
parameters
```

成功后由星辰返回：

```text
execute_id
```

服务端可使用：

```text
POST /workflow/v1/async/chat/result
```

查询真实异步运行状态。

RiskTrace Demo Mock 只借用这套输入/响应命名保持结构一致；为降低 Demo 复杂度，Mock 不实现 result 轮询，而是在一次调用中同步产生两类业务输出。

---

## 21. 最终结论

当前 Demo 的原则应统一为：

```text
真实业务链路保持“一条工作流、一个 reviewRun、一个当前 executeId”
+
Demo Mock 保持“星辰形状、同步完成、不轮询”
```

因此：

```text
Demo：
项目标题
→ 上传全部材料
→ 一次调用 Xingchen-shaped Mock
→ 材料理解 + 最终报告同时落库
→ 前端直接展示

正式：
项目标题
→ 上传全部材料
→ 启动一条星辰异步工作流
→ 材料理解回调
→ 同一执行继续领域审查
→ 最终报告回调
→ 报告展示
```

这样 Mock 不再反向塑造正式架构，正式接入星辰时也不需要推翻数据模型、结果 Schema 和页面结构。
