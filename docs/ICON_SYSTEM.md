# RiskTrace 图标系统规范

## 1. 规范目标

RiskTrace 的图标必须服务于信息识别、操作理解和状态表达，不能作为无业务意义的装饰。

统一图标系统的目标是：

- 保持企业级后台界面的视觉一致性；
- 防止 AI 随意混用多个图标家族；
- 防止使用 Emoji、Unicode 符号或临时 SVG 充当正式图标；
- 统一图标的语义、尺寸、颜色、交互和无障碍行为；
- 允许未来集中替换图标，而不需要逐页修改业务组件。

## 2. 唯一批准的通用图标库

RiskTrace 通用界面图标只允许使用：

```text
@element-plus/icons-vue
```

选择该图标库的原因：

- 项目已经使用 Element Plus；
- 图标风格与按钮、表单、菜单、消息和弹窗保持一致；
- 不需要引入第二套视觉语言；
- 支持按需导入，便于控制打包体积；
- 适合 Vue 3 与 TypeScript。

禁止新增或混用：

- Lucide；
- Heroicons；
- Material Icons；
- Font Awesome；
- Iconify 中的其他图标集；
- CSS 绘制图标；
- Unicode 图形符号；
- Emoji；
- AI 临时生成的通用 SVG 图标。

品牌标志、业务专属示意图和确有必要的领域图形不属于通用图标库，但必须作为正式静态资源管理，并经过设计评审。

## 3. 安装方式

项目依赖中应包含：

```bash
pnpm add @element-plus/icons-vue
```

除非明确说明，不允许全量全局注册全部图标。业务代码应采用按需导入，并通过统一出口访问。

## 4. 统一图标出口

所有通用图标必须由以下文件统一导出：

```text
src/icons/index.ts
```

除 `src/icons/index.ts` 外，其他业务文件禁止直接从 `@element-plus/icons-vue` 导入图标。

推荐结构：

```ts
import {
  Bell,
  CircleCheckFilled,
  Close,
  DataAnalysis,
  Delete,
  DocumentChecked,
  Download,
  EditPen,
  Expand,
  Filter,
  Finished,
  Fold,
  Grid,
  Loading,
  Menu,
  MoreFilled,
  Refresh,
  Search,
  Setting,
  Upload,
  User,
  View,
  WarningFilled,
} from '@element-plus/icons-vue'

export const AppIcons = {
  navigation: {
    dashboard: DataAnalysis,
    cases: DocumentChecked,
    tasks: Finished,
    rules: Setting,
    foundation: Grid,
  },
  action: {
    search: Search,
    filter: Filter,
    refresh: Refresh,
    upload: Upload,
    download: Download,
    view: View,
    edit: EditPen,
    delete: Delete,
    more: MoreFilled,
  },
  layout: {
    menu: Menu,
    collapse: Fold,
    expand: Expand,
    close: Close,
  },
  status: {
    success: CircleCheckFilled,
    warning: WarningFilled,
    loading: Loading,
  },
  account: {
    user: User,
    notification: Bell,
  },
} as const
```

业务代码统一使用：

```ts
import { AppIcons } from '@/icons'
```

统一出口必须按业务语义组织，禁止把所有图标平铺成没有分类的长列表。

## 5. 图标选择规则

选择图标时必须遵守：

1. 同一业务含义在全项目中使用同一个图标；
2. 优先选择含义明确、轮廓简单的图标；
3. 不因为页面“太空”而添加图标；
4. 不给每张卡片标题、每个数字和每段说明都添加图标；
5. 同一区域避免同时出现多个相似图标；
6. 图标不能替代必要的文字标签；
7. 风险状态不能只靠图标和颜色表达，必须同时显示文字。

典型语义建议：

| 场景 | 建议图标 |
|---|---|
| 风险驾驶舱 | `DataAnalysis` |
| 风险事件 | `DocumentChecked` |
| 处置任务 | `Finished` |
| 规则中心 | `Setting` |
| 搜索 | `Search` |
| 筛选 | `Filter` |
| 刷新 | `Refresh` |
| 查看 | `View` |
| 编辑 | `EditPen` |
| 删除 | `Delete` |
| 上传 | `Upload` |
| 下载 | `Download` |
| 用户 | `User` |
| 通知 | `Bell` |

该表是默认建议。新增语义映射时应先检查 `src/icons/index.ts`，避免重复。

## 6. 线性图标与填充图标

- 导航、按钮、筛选、表格操作默认使用普通线性图标；
- 填充图标只用于明确状态，例如成功、警告或错误；
- 同一语义不得在不同页面混用线性版和填充版；
- 不把警告、成功等状态图标当作装饰元素；
- 品牌标识不得由通用图标库替代。

## 7. 尺寸规范

图标尺寸通过src/styles/tokens.css统一控制：

```css
:root {
  --rt-icon-size-xs: 14px;
  --rt-icon-size-sm: 16px;
  --rt-icon-size-md: 18px;
  --rt-icon-size-lg: 20px;
  --rt-icon-size-xl: 24px;
  --rt-icon-size-state: 40px;
}
```

推荐使用：

| 场景 | 尺寸 |
|---|---:|
| 表格行内操作 | 16px |
| 普通按钮 | 16px |
| 导航菜单 | 18px |
| 顶栏操作 | 18px |
| 标题辅助图标 | 20px |
| 重点入口 | 24px |
| 空状态或结果状态 | 40px |

禁止在业务组件中随意写入 17px、19px、22px 等任意尺寸。

## 8. 颜色规范

普通图标默认使用：

```css
color: currentColor;
```

图标应继承所在文本或按钮的颜色，而不是自行定义颜色。

语义约束：

- 普通图标：继承正文或次要文字颜色；
- 当前导航：继承主色；
- 成功状态：使用成功语义色；
- 警告或高风险：使用对应语义色；
- 错误、删除和重大风险：使用危险语义色；
- 禁用状态：继承禁用文字颜色。

禁止：

- 为普通搜索、编辑、查看图标单独设置彩色；
- 在业务组件中硬编码图标颜色；
- 使用多色图标制造装饰效果；
- 只通过颜色表达状态。

## 9. 图标按钮

纯图标按钮必须统一通过：

```text
src/components/common/IconButton.vue
```

该组件负责统一：

- 图标尺寸；
- 按钮尺寸；
- Tooltip；
- `aria-label`；
- 禁用状态；
- 危险操作语义；
- 键盘焦点和点击行为。

推荐用法：

```vue
<IconButton
  :icon="AppIcons.action.refresh"
  label="刷新数据"
  @click="handleRefresh"
/>
```

禁止在业务页面中重复手写无标签的圆形图标按钮。

图标旁边已有明确文字时，可以直接结合 Element Plus 按钮使用：

```vue
<el-button :icon="AppIcons.action.search">
  查询
</el-button>
```

## 10. 无障碍要求

纯图标按钮必须同时提供：

- 可理解的 `aria-label`；
- Tooltip 或等价悬浮说明；
- 可见的键盘焦点状态；
- 禁用原因或可理解的禁用状态。

当图标旁边已有完整文字标签时，图标应设置为装饰性内容，避免屏幕阅读器重复朗读。

示例：

```vue
<el-icon aria-hidden="true">
  <component :is="AppIcons.action.search" />
</el-icon>
<span>查询</span>
```

禁止使用只有图标、没有可访问名称的交互控件。

## 11. 导航图标

导航配置应直接保存图标组件，不得使用文字首字、Emoji 或 CSS 方块代替图标。

推荐类型：

```ts
import type { Component } from 'vue'

export interface NavigationItem {
  key: string
  label: string
  to: string
  icon: Component
  description?: string
  badge?: string | number
  exact?: boolean
  group?: string
}
```

推荐渲染：

```vue
<el-icon class="app-sidebar__link-icon" aria-hidden="true">
  <component :is="item.icon" />
</el-icon>
```

## 12. ESLint 强制边界

ESLint 应限制业务代码直接导入图标库：

```js
{
  files: ['src/**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@element-plus/icons-vue',
            message: '请统一从 @/icons 导入图标，禁止在业务文件中直接导入图标库。',
          },
        ],
      },
    ],
  },
},
{
  files: ['src/icons/index.ts'],
  rules: {
    'no-restricted-imports': 'off',
  },
}
```

若当前 ESLint 配置结构不同，应以等价方式实现同一约束。

## 13. 静态资源与专属 SVG

以下内容可以使用独立 SVG 或图片资源：

- RiskTrace 品牌标志；
- 业务流程图；
- 证据链图形；
- 无法由通用图标准确表达的领域专属符号；
- 报告和演示中的正式插图。

要求：

- 文件放在 `public/` 或 `src/assets/`；
- 使用语义化文件名；
- 不把 SVG 代码散落到业务模板；
- 不使用 AI 随机生成的占位图标；
- 不用远程 URL 作为核心界面资源；
- 新增前确认 Element Plus Icons 中没有合适图标。

## 14. AI 编程强制检查

AI 在生成或修改涉及图标的代码前，必须：

1. 阅读本文件；
2. 搜索 `src/icons/index.ts` 是否已有对应语义；
3. 搜索 `IconButton.vue` 是否可以满足交互需求；
4. 检查相邻页面使用的图标和尺寸；
5. 说明新增图标的业务含义；
6. 禁止自行安装其他图标库；
7. 禁止使用 Emoji、Unicode 符号和临时 SVG；
8. 确认纯图标按钮具有无障碍名称和 Tooltip。

## 15. 提交前检查清单

- 通用图标全部来自 `@element-plus/icons-vue`；
- 业务文件统一从 `@/icons` 导入；
- 没有引入第二套图标库；
- 没有 Emoji 或 Unicode 图形符号；
- 没有文字首字方块冒充图标；
- 图标尺寸使用统一令牌；
- 图标颜色默认继承 `currentColor`；
- 同一语义使用同一图标；
- 纯图标按钮使用 `IconButton.vue`；
- 纯图标按钮具备 Tooltip 和 `aria-label`；
- 状态没有只依赖图标和颜色表达；
- ESLint 图标导入边界检查通过。
