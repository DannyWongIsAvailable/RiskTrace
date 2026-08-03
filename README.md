# RiskTrace

RiskTrace 是面向企业采购项目的全生命周期合规审查 Demo。系统将分批上传、格式不统一的采购材料转化为带证据的结构化事实，并通过完整性检查、确定性规则和合规审查工作流生成风险报告，最终形成补件、人工复核、升级审批或付款控制任务。

> 线上地址：https://risktrace.pages.dev/

完整产品与比赛 MVP 设计见：`docs/Demo应用设计方案.md`。

## 1. 核心链路

```text
创建采购项目
→ 分批上传材料
→ 提取候选事实与证据
→ 校验并生成事实快照
→ 检查材料和事实完整性
→ 发起完整或受限范围合规审查
→ 生成可解释风险报告
→ 创建处置任务并记录审计事件
```

RiskTrace 的关键约束：

- 模型只生成候选事实，不直接修改正式事实；
- 每项正式事实必须能够追溯到文件、页码或工作表和原文；
- 缺失、未识别、冲突、不适用和阶段未形成必须分别表达；
- 金额、日期、评分、阈值和状态流转由后端确定性逻辑处理；
- 材料不完整时允许受限范围合规审查，但必须披露无法验证事项；
- 风险结论必须同时展示事实、规则、证据和建议动作。

## 2. 领域术语

| 业务概念 | 界面名称 | 代码命名 |
|---|---|---|
| 顶层业务对象 | 采购项目 | `project` / `Project` |
| 单次材料核验与风险研判 | 合规审查 | `review` / `reviewRun` |
| 合规审查检出结果 | 风险事项 | `riskFinding` / `RiskFinding` |
| 招标阶段子对象 | 招标项目、标段或采购包 | 按实际层级分别建模 |

“风险发现”用于描述识别动作，不作为实体名称；“标案”“采购事件”“风险事件”和 `case` 不作为新功能命名。

## 3. 系统架构

```text
Vue 3 Web 应用
        │ REST API
Cloudflare Pages Functions
        ├─ Cloudflare D1：采购项目、事实快照、合规审查、风险事项和任务
        ├─ Cloudflare R2：原始材料与文件版本
        ├─ Workers AI：材料分类、候选事实提取和证据定位
        └─ 合规审查工作流：结构化风险研判，可替换 Provider
```

Pages Functions 负责参数校验、文件处理编排、事实归并、完整性检查、确定性规则、合规审查编排、幂等控制和审计记录。前端不得直接访问数据库、对象存储或外部模型服务。

## 4. 技术栈

### 前端

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- Element Plus Icons
- UnoCSS
- 原生 Fetch 统一封装

### Cloudflare 与后端

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare Workers Runtime
- Cloudflare D1
- Cloudflare R2
- Wrangler
- D1 Migrations

### 外部合规审查服务

合规审查工作流通过统一 Provider 接口接入。比赛版本可使用百炼实现，但业务层不得与特定平台 SDK 强耦合。

## 5. 目标页面与路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/dashboard` | 风险总览 | 项目、材料缺口、风险和任务指标 |
| `/projects` | 采购项目列表 | 查询、新建和导入演示项目 |
| `/projects/:projectId` | 项目工作台 | 材料、事实、缺口、冲突和提交合规审查 |
| `/projects/:projectId/reviews/:reviewRunId` | 合规审查报告 | 风险事项、规则、证据和建议动作 |
| `/tasks` | 处置中心 | 补件、复核、升级审批和付款控制 |
| `/foundation` | 设计系统 | 开发阶段基础组件预览 |

当前仓库已完成前端工程底座、设计系统、统一请求和观测能力，核心采购项目业务链路仍需按设计方案逐步接入。旧占位路由或旧业务词汇不得作为新功能命名依据。

## 6. 目录约定

```text
src/views/              路由级页面
src/layouts/            应用壳层
src/components/common/  通用基础组件
src/components/<domain> 领域复用组件
src/api/modules/        类型化前端 API
src/stores/             跨路由共享状态
src/types/              跨模块类型
src/constants/          稳定配置和枚举映射
src/icons/              图标统一出口
src/mocks/              明确标识的演示数据
src/styles/             全局设计系统
functions/api/          对外 REST API
functions/internal/     内部受控接口
functions/_shared/      后端共享能力
```

具体规则见 `AGENTS.md` 和 `docs/FILE_STRUCTURE.md`。

## 7. 环境要求

- Node.js：以 `package.json` 的 `engines` 字段为准；
- 包管理器：pnpm；
- Cloudflare 本地联调：Wrangler。

安装依赖：

```bash
pnpm install
```

启动纯前端开发环境：

```bash
pnpm dev
```

联调 Pages Functions 与本地 Cloudflare 资源：

```bash
pnpm cf:dev
```

## 8. 质量检查与构建

执行完整检查：

```bash
pnpm check
```

包含：

- Vue 与前端 TypeScript 类型检查；
- Pages Functions TypeScript 类型检查；
- OXLint；
- ESLint；
- Prettier；
- Vite 构建。

单独构建：

```bash
pnpm build
```

## 9. D1 与部署命令

创建迁移：

```bash
pnpm db:migration:create <migration-name>
```

应用本地迁移：

```bash
pnpm db:migrate:local
```

应用远程迁移：

```bash
pnpm db:migrate:remote
```

部署到 Cloudflare Pages：

```bash
pnpm cf:deploy
```

## 10. 开发前必读

- `docs/Demo应用设计方案.md`：产品架构、设计链路和比赛范围；
- `AGENTS.md`：AI 与人工开发必须遵守的工程契约；
- `AI_FRONTEND_STANDARD.md`：前端开发速查；
- `docs/FRONTEND_DESIGN_SYSTEM.md`：设计系统；
- `docs/ICON_SYSTEM.md`：图标规范；
- `docs/API_CONVENTIONS.md`：接口规范；
- `docs/ERROR_HANDLING_AND_OBSERVABILITY.md`：错误处理与观测；
- `docs/FILE_STRUCTURE.md`：目录职责。

## 11. 核心工程规则

- 顶层业务对象统一使用“采购项目”和 `project` 命名；
- Vue 组件和 Pinia Store 不得直接调用 `fetch`；
- 浏览器请求统一经过 `src/api/request.ts` 与 `src/api/modules/`；
- API 使用统一响应、错误码和请求编号；
- 优先复用 `src/components/common/`；
- 统一使用 `src/styles/tokens.css` 的设计令牌；
- 通用图标统一通过 `src/icons/index.ts` 访问；
- 演示数据只能放在 `src/mocks/` 或明确的后端演示数据模块；
- 数据页面必须覆盖加载、成功、空数据和错误状态；
- 模型结果必须经过后端校验，不能直接成为正式事实或风险结论；
- 不得引入第二套 UI 框架、状态库或 HTTP 客户端；
- 密钥不得提交到仓库、写入前端或输出到日志。
