# RiskTrace API 规范

## 1. 路径与资源风格

所有业务接口统一放在 `/api` 下，优先使用 REST 风格的资源名词：

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
POST   /api/projects/:projectId/actions
GET    /api/tasks
PATCH  /api/tasks/:taskId
```

路径中尽量避免直接使用动作动词。
只有当某项操作属于明确的业务命令，且无法通过常规资源更新准确表达时，才使用动作型子资源，例如：

```text
POST /api/projects/:projectId/actions
POST /api/projects/:projectId/reviews
```

接口路径：

- 使用小写字母；
- 多个单词使用连字符；
- 集合资源使用复数名词；
- 不在路径中加入版本、页面名称或前端组件名称；
- 不暴露数据库表名和内部实现结构。

## 2. 统一响应结构

### 成功响应

```json
{
  "success": true,
  "data": {},
  "message": "可选的用户可读提示",
  "meta": {
    "requestId": "可选请求编号",
    "timestamp": "2026-07-27T10:22:00.000Z"
  }
}
```

### 失败响应

```json
{
  "success": false,
  "code": "PROJECT_NOT_FOUND",
  "message": "未找到采购项目",
  "details": {},
  "meta": {
    "requestId": "可选请求编号",
    "timestamp": "2026-07-27T10:22:00.000Z"
  }
}
```

要求：

- 失败操作不得返回成功 HTTP 状态码；
- `message` 必须可以安全展示给用户；
- `details` 仅用于结构化校验信息或安全的补充上下文；
- 禁止返回堆栈、SQL、密钥、内部文件路径和第三方供应商原始响应；
- 前端程序逻辑根据稳定错误码分支，不根据可读文案分支。
- 所有响应头必须包含 `X-Request-Id`；
- JSON 响应的 `meta.requestId` 应与响应头一致。

## 3. HTTP 状态码建议

```text
200  查询或更新成功
201  资源创建成功
204  成功且无需返回正文
400  请求格式或参数无效
401  未登录或认证失效
403  无权执行操作
404  资源不存在
409  当前业务状态冲突
422  业务校验失败
429  请求频率过高
500  未预期的服务端错误
```

## 4. 错误码

错误码使用稳定的大写下划线格式：

```text
VALIDATION_FAILED
UNAUTHORIZED
FORBIDDEN
PROJECT_NOT_FOUND
TASK_NOT_FOUND
CONFLICTING_STATE
RATE_LIMITED
INTERNAL_ERROR
```

错误码一旦被前端使用，不应随意修改。

推荐按业务领域扩展：

```text
PROJECT_ALREADY_CLOSED
PAYMENT_ALREADY_HELD
REVIEW_REASON_REQUIRED
RULE_CODE_CONFLICT
```

## 5. 分页

请求参数：

```text
?page=1&pageSize=20
```

响应数据：

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

要求：

- `page` 从 1 开始；
- `pageSize` 设置合理上限；
- 排序字段必须使用白名单；
- 不直接把用户输入拼接进 SQL；
- 列表接口返回稳定的排序结果。

## 6. 查询、筛选和排序

推荐格式：

```text
GET /api/projects?page=1&pageSize=20&riskLevel=critical&status=pending&sort=-updatedAt
```

约定：

- 简单字段直接作为查询参数；
- 多值筛选可重复参数或使用逗号分隔，但同一项目必须统一；
- 排序字段前的 `-` 表示降序；
- 复杂查询不要把任意 JSON 塞入 URL；
- 日期范围使用明确字段，如 `createdFrom`、`createdTo`。

## 7. 日期与时间

传输层统一使用 ISO 8601 UTC 字符串：

```text
2026-07-27T10:22:00.000Z
```

要求：

- 数据库存储和接口传输保持统一时区约定；
- 前端展示层再按用户时区格式化；
- 不传输含义模糊的本地时间字符串；
- 仅表示日期的字段使用 `YYYY-MM-DD`。

## 8. 金额与数值

金额在可行时使用最小货币单位的整数存储和传输，例如人民币分。

示例类型：

```ts
interface MoneyAmount {
  amountMinor: number
  currency: 'CNY'
}
```

要求：

- 不使用浮点数参与付款、阈值和累计金额判断；
- 类型或文档中必须明确金额单位；
- 前端只负责格式化展示，不自行改变业务精度；
- 百分比和置信度需明确取值范围是 `0–1` 还是 `0–100`。

## 9. 请求体与字段命名

- JSON 字段统一使用 camelCase；
- 请求体只包含当前操作所需字段；
- 更新接口优先使用 `PATCH` 表示部分更新；
- 不允许客户端提交服务端负责生成的审计字段；
- 枚举值必须有明确类型和文档；
- 用户输入在服务端验证后才能访问数据库。

## 10. 前端调用规范

所有浏览器请求必须经过：

```text
src/api/request.ts
src/api/modules/<domain>.ts
```

要求：

- 路由拥有的请求使用 `AbortSignal`，页面离开时可取消；
- Vue 组件处理用户可见的加载和错误状态，但不解析传输层响应；
- 接口模块负责请求与响应类型；
- 领域转换复杂时，在 API 模块中完成映射；
- 不在 Vue 组件、Store 或工具函数中重复拼接 URL。

## 11. Cloudflare Pages Functions

Pages Functions 应复用 `functions/_shared/http.ts` 中的响应工具。

要求：

- 除明确允许缓存的接口外，JSON 响应默认带 `Cache-Control: no-store`；
- 访问 D1 前完成输入校验；
- 对数据库写操作处理冲突与重试边界；
- 返回用户可理解、但不泄露内部信息的错误；
- 每个需要审计的业务动作写入审计记录；
- 环境变量和密钥仅通过绑定读取。
- 路由从 `context.data.requestId` 读取全局中间件生成的请求编号，并传入 `success` 或 `failure`；
- 未处理异常由 `functions/_middleware.ts` 统一记录和转换为 500 响应；
- 日志使用结构化 JSON，至少包含请求编号、方法、路径、状态码和耗时。

## 12. 接口变更原则

涉及以下变更时，应同步更新类型、文档和调用方：

- 路径；
- 请求字段；
- 响应结构；
- 错误码；
- 枚举值；
- 金额或日期单位；
- 权限要求。

破坏性变更必须明确说明迁移方式，不允许悄悄改变既有接口语义。
