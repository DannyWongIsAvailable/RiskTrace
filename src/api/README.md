# 前端 API 层说明

所有浏览器端 HTTP 请求必须经过：

```text
src/api/request.ts
src/api/modules/<domain>.ts
```

Vue 组件和 Pinia Store 不得直接调用 `fetch`。

## 1. 目录职责

```text
src/api/request.ts       统一请求客户端、查询参数、错误归一化
src/api/modules/         按业务领域组织接口函数和类型
src/types/api.ts         通用响应、分页和错误类型
```

推荐按业务领域建立模块：

```text
src/api/modules/projects.ts
src/api/modules/uploads.ts
src/api/modules/reviews.ts
src/api/modules/dashboard.ts
```

## 2. 基本规则

1. Vue 组件禁止直接调用 `fetch`；
2. 每个业务领域拥有独立 API 模块；
3. 请求参数、查询参数和响应模型必须显式声明类型；
4. 查询参数通过统一客户端的 `query` 选项传递；
5. 请求错误统一归一化为 `ApiError`；
6. 组件负责展示加载、空数据、错误和成功状态；
7. API 模块负责传输结构，不把原始响应解析暴露给组件；
8. 路由拥有的请求应支持 `AbortSignal`；
9. 不在多个文件中重复接口路径；
10. 不静默吞掉错误。

## 3. 示例

```ts
interface ProjectQuery {
  page: number
  pageSize: number
  riskLevel?: string
}

export function listProjects(
  query: ProjectQuery,
  signal?: AbortSignal,
): Promise<PaginatedData<Project>> {
  return http.get('/api/projects', { query, signal })
}
```

页面调用时：

- 开始请求前进入加载状态；
- 请求成功后处理数据或空数据；
- 请求失败后展示用户可理解的错误；
- 页面销毁或参数变化时取消旧请求；
- 不向用户展示内部错误对象和堆栈。

## 4. 详细规范

新增接口前请阅读：

```text
docs/API_CONVENTIONS.md
AGENTS.md
```

## 5. 错误观测

统一请求客户端会把非取消类 `ApiError` 发送到 `src/observability/`，记录请求方法、路径、状态码、错误码和请求编号，但不会记录请求体或查询参数内容。

观测模块为避免递归上报，允许在自身传输实现中直接使用原生 `sendBeacon` 或 `fetch`；除此之外，浏览器端业务代码仍不得绕过 `src/api/request.ts`。
