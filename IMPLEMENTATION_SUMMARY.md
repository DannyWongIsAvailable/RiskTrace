# 企业级前端基础层改造摘要

## 1. 本次改造目标

本次改造以“建立可持续扩展的企业级前端基础层”为目标，重点解决初始化项目缺少统一视觉、组件规范、接口规范和 AI 编程约束的问题。

改造不以一次性堆叠业务页面为目标，而是优先建立后续所有页面都能复用的设计与工程基础。

## 2. 已完成内容

### 2.1 统一视觉基础

- 建立品牌、颜色、字体、间距、圆角、阴影和布局令牌；
- 建立 Element Plus 全局主题覆盖；
- 建立浏览器样式重置和跨页面工具样式；
- 统一页面背景、内容面板、状态色和信息层级；
- 增加 RiskTrace 品牌 SVG 与站点图标。

### 2.2 企业后台应用壳层

- 建立响应式企业后台整体布局；
- 建立桌面端左侧导航；
- 建立移动端抽屉导航；
- 建立顶部栏、面包屑和页面内容区域；
- 建立统一导航配置和路由元信息类型。

### 2.3 通用基础组件

已建立：

- 页面标题 `PageHeader`；
- 章节标题 `SectionHeader`；
- 通用卡片 `BaseCard`；
- 表格卡片 `BaseTableCard`；
- 指标卡片 `MetricCard`；
- 筛选栏 `FilterBar`；
- 状态标签 `StatusTag`；
- 内联提示 `InlineNotice`；
- 结构化详情 `DescriptionList`；
- 分页栏 `PaginationBar`；
- 确认操作弹窗 `ConfirmActionDialog`；
- 加载状态 `LoadingState`；
- 空数据状态 `EmptyState`；
- 错误状态 `ErrorState`；
- 统一图标按钮 `IconButton`；
- 品牌标识 `AppLogo`。

### 2.4 示例页面与路由

- `/dashboard`：企业级风险驾驶舱示例；
- `/foundation`：基础组件与统一视觉预览；
- `/cases`：采购事件业务边界占位页；
- `/tasks`：处置任务业务边界占位页；
- `/rules`：规则中心业务边界占位页；
- 未匹配路由：统一 404 页面。

### 2.5 API 与后端响应规范

- 建立统一浏览器 HTTP 客户端；
- 建立业务 API 模块目录；
- 建立标准成功、失败和分页类型；
- 建立 Cloudflare Pages Functions 统一 JSON 响应工具；
- 明确错误码、日期、金额、分页和缓存规范；
- 移除重复请求文件，避免多套接口封装并存。

### 2.6 代码质量与 AI 约束

- 完善 ESLint、OXLint、Prettier 和 EditorConfig；
- 增加 VS Code 推荐配置；
- 重写 `AGENTS.md`；
- 增加前端设计系统、接口规范、目录规范与贡献指南；
- 明确禁止 Emoji、重复组件、组件内直接请求和随意硬编码样式；
- 删除初始化模板中的无效计数器 Store 和重复请求文件。

## 3. 主要入口

```text
/dashboard   风险驾驶舱示例
/foundation  基础组件与设计系统预览
/cases       采购事件业务入口
/tasks       处置任务业务入口
/rules       规则中心业务入口
```

## 4. 已完成验证

- TypeScript 与 Vue `<script setup>` 语法检查通过；
- Cloudflare Pages Functions 严格 TypeScript 检查通过；
- JSON 与 SVG 文件基础检查通过；
- 空白字符和 Emoji 范围扫描完成；
- 未发现显式 `any`；
- 未发现 Vue 组件直接调用 `fetch`；
- 未发现普通布局使用内联样式；
- 未发现业务组件随意硬编码颜色。

## 5. 尚未完成的环境验证

当前执行环境无法连接 npm 包仓库，因此未能在容器中重新安装依赖并执行完整 Vite 构建。

项目未增加新的 npm 依赖，保留原有 `pnpm-lock.yaml`。在本地覆盖后应执行：

```bash
pnpm install
pnpm check
```

## 6. 后续建议

建议按以下顺序继续开发：

1. 采购事件列表与详情；
2. 演示案例初始化接口；
3. 智能分析步骤与 Agent 执行记录；
4. 风险证据链；
5. 暂缓付款、补件与升级复核；
6. 规则中心和人工反馈；
7. 真实 D1 迁移与 Pages Functions 接口；
8. 最后再增加外部 AI 模型和文件存储能力。

所有新增页面应基于现有应用壳层、基础组件和设计令牌实现。


## 图标规范补充

项目规范已明确：

- `@element-plus/icons-vue` 是唯一批准的通用图标库；
- 通用图标通过 `src/icons/index.ts` 中的 `AppIcons` 统一导出；
- 业务文件禁止直接导入图标库；
- 纯图标按钮统一使用 `IconButton.vue`；
- 禁止 Emoji、Unicode 符号、文字首字、CSS 图形和临时 SVG 冒充正式图标；
- 图标尺寸、颜色、语义和无障碍规则见 `docs/ICON_SYSTEM.md`。
