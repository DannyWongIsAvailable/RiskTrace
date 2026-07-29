# RiskTrace 错误处理与观测规范

## 1. 目标

项目通过统一错误入口、请求编号和结构化日志，保证浏览器异常、路由异常、未处理 Promise、API 异常与 Pages Functions 异常可以被定位和关联。

当前实现不绑定具体第三方平台。开发环境默认输出结构化控制台日志；配置观测地址后，可将浏览器错误事件发送到外部采集端。

## 2. 浏览器端入口

统一实现位于：

```text
src/observability/index.ts
src/components/common/GlobalErrorNotice.vue
```

`src/main.ts` 调用 `installGlobalErrorHandling` 后，统一捕获：

- Vue 运行时错误；
- Vue Router 加载错误；
- `window.error`；
- 未处理的 Promise rejection；
- 经 `src/api/request.ts` 归一化的 API 错误。

未预期的全局异常会显示错误编号。API 错误默认只进入日志和观测通道，由具体页面决定用户提示，避免重复弹出错误信息。

## 3. 浏览器错误事件结构

事件包含：

```text
id
时间
来源
严重程度
错误名称
错误消息
堆栈
当前路由
附加上下文
```

禁止把密码、令牌、完整请求体、身份证件、付款账户或其他敏感业务数据写入 `metadata`。

## 4. 外部观测地址

可通过环境变量配置：

```text
VITE_OBSERVABILITY_ENDPOINT=/api/observability/client-errors
```

未配置时仅输出到浏览器控制台。配置后，观测模块优先使用 `sendBeacon`，失败时使用原生 `fetch` 发送。该传输不经过业务请求封装，避免观测上报失败再次触发 API 错误循环。

## 5. API 请求错误

`src/api/request.ts` 统一：

- 把异常归一化为 `ApiError`；
- 读取响应体 `meta.requestId` 或 `X-Request-Id`；
- 记录请求方法、路径、状态码、错误码和请求编号；
- 忽略主动取消产生的观测事件；
- 不记录请求体和查询参数内容。

业务页面仍负责加载、空数据、错误和重试状态。

## 6. Pages Functions 中间件

全局中间件位于：

```text
functions/_middleware.ts
```

每个请求都会：

- 接收或生成 `X-Request-Id`；
- 将请求编号写入 `context.data.requestId`；
- 记录请求方法、路径、状态码和耗时；
- 在响应头写入 `X-Request-Id` 和 `Server-Timing`；
- 捕获未处理异常并返回统一 500 响应；
- 输出结构化 JSON 日志。

Pages Functions 路由应使用以下数据类型并把请求编号传入响应工具：

```ts
type RequestData = {
  requestId?: string
}

export const onRequestGet: PagesFunction<Env, string, RequestData> = ({ data }) =>
  success(result, { requestId: data.requestId })
```

## 7. 错误处理边界

- 可预期业务错误：返回稳定错误码和安全文案；
- 参数校验错误：返回 400 或 422；
- 权限错误：返回 401 或 403；
- 状态冲突：返回 409；
- 未预期异常：由全局中间件记录并返回 500；
- 不得把堆栈、SQL、环境变量或第三方原始响应返回给浏览器。

## 8. 新增功能检查

新增功能时确认：

1. API 调用经过 `src/api/request.ts`；
2. 页面展示自己的可恢复错误状态；
3. 未处理异常可以进入全局观测模块；
4. Functions 响应携带请求编号；
5. 日志不包含敏感数据；
6. 用户报告问题时可以提供错误编号或请求编号。
