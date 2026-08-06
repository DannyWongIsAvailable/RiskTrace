# RiskTrace Demo 应用设计方案

> 版本：v1.3（单工作流贯通材料理解与报告聚合）  
> 修订日期：2026-08-04  
> 技术栈：Vue 3 + TypeScript + Cloudflare Pages Functions + R2 + D1 + 讯飞星辰 Agent 工作流

---

## 1. 方案摘要

RiskTrace 是一个面向企业采购项目的智能合规审查 Demo。当前版本优先完成一条简单、连续、可演示的自动化链路，不在材料确认、风险处置、复杂权限和精细化数据建模上投入过多开发成本。

用户只需要填写采购项目标题，并一次性上传当前拥有的全部材料。材料上传完成后，系统自动启动讯飞星辰 Agent 工作流，不再要求用户手工选择材料类别，也不再要求用户点击“发起审查”或确认 AI 的识别结果。

同一条星辰工作流首先完成材料理解，自动识别每份文件的材料名称、业务类别和简要摘要，并生成项目摘要及材料完整性检查结果。材料理解中间结果由 RiskTrace API 校验、幂等保存并立即提供给前端展示，但工作流执行实例不会结束，也不会再创建第二条工作流。

随后，同一工作流继续由路由 Agent 根据材料理解结果选择需要调用的领域 Agent。各领域 Agent 同时参考材料理解对象和原始文件，对采购审批、供应商与合同、履约验收、发票付款等领域进行审查。最后由聚合 Agent 合并风险并生成最终报告，RiskTrace API 对报告结构和文件引用进行校验后保存到 D1。一次审查运行始终只维护一个当前有效的 Provider `executeId`。

### 1.1 核心业务链路

```text
用户填写项目标题
        ↓
一次性上传全部材料
        ↓
上传完成后自动启动讯飞星辰 Agent 工作流
        ↓
自动分类、逐文件摘要、项目摘要、完整性检查
        ↓
材料理解中间结果由 API 校验、保存并展示到前端
        ↓
同一工作流无需人工确认，继续进入领域审查
        ↓
路由 Agent 选择适用的领域 Agent
        ↓
领域 Agent 结合材料对象和原文件进行审查
        ↓
聚合 Agent 生成最终风险报告
        ↓
API 校验并保存数据库
        ↓
前端展示最终报告
```

### 1.2 当前版本的简化原则

- 用户只填写项目标题，不填写采购类型、金额、部门或当前阶段；
- 用户只负责一次性上传全部已有材料，不手工分类；
- 上传完成后自动启动审查，不设置单独的“发起审查”步骤；
- 材料理解结果直接展示，不设置人工确认或修改步骤；
- 材料理解中间结果只保留足够前端展示和工作流后续节点使用的轻量字段；
- 不要求前端展示每个 Agent 节点的完整内部状态，只展示同一工作流的业务阶段进度；
- 不保存复杂的逐字段事实模型，材料理解中间结果以结构化 JSON 快照保存；
- 不建设风险确认、误报驳回、暂缓付款、补件任务和审计处置闭环；
- AI 只生成分析结果，不能直接修改原始文件、项目标题或系统标识。

---

## 2. 项目定位与范围

### 2.1 产品名称

**RiskTrace 企业采购项目智能合规审查 Demo**

### 2.2 一句话定位

用户上传一个采购项目的全部材料后，系统自动理解材料、检查缺失项、调用多个领域 Agent 完成合规审查，并生成可追溯到原文件的风险报告。

### 2.3 当前 Demo 必须实现

```text
项目创建
→ 批量上传
→ 自动材料理解
→ 自动完整性检查
→ 自动领域审查
→ 风险聚合
→ 报告展示
```

### 2.4 当前 Demo 暂不实现

- 用户手工选择或修改材料类别；
- 材料理解结果的人工确认；
- 完整采购流程管理；
- 复杂角色、组织和权限体系；
- 风险人工确认、误报驳回和整改闭环；
- 真实付款控制和银行接口；
- 全量工商、司法、税务等外部商业数据；
- 复杂规则配置平台；
- 面向生产环境的全格式、超大文件和复杂版式兼容。

---

## 3. 总体架构

```text
┌──────────────────────────────────────────────┐
│                   Vue 前端                   │
│ 项目标题 / 批量上传 / 阶段进度 / 材料结果 / 报告 │
└──────────────────────┬───────────────────────┘
                       │ REST API
┌──────────────────────▼───────────────────────┐
│          Cloudflare Pages Functions          │
│ 项目创建 / 上传签名 / 状态编排 / 结果校验 / 落库 │
└───────────────┬────────────────┬─────────────┘
                │                │
       ┌────────▼────────┐ ┌─────▼───────────┐
       │ Cloudflare R2   │ │ Cloudflare D1   │
       │ 原始材料与派生件 │ │ 项目、文件、运行、结果 │
       └────────┬────────┘ └─────▲───────────┘
                │ 短时 GET URL    │
┌───────────────▼────────────────┴─────────────┐
│             讯飞星辰 Agent 平台             │
│ 单一工作流：材料理解 → 路由与领域审查 → 风险聚合 │
└──────────────────────────────────────────────┘
```

### 3.1 Vue 前端职责

- 创建项目时只采集项目标题；
- 一次选择并上传多份材料；
- 展示单文件上传进度和失败重试；
- 上传完成后显示自动审查状态；
- 展示材料理解中间结果；
- 轮询项目审查状态；
- 展示最终风险报告。

前端不得直接调用讯飞星辰、R2 或 D1。

### 3.2 Pages Functions 职责

- 创建项目和系统 ID；
- 为每份文件生成 R2 预签名 PUT URL；
- 校验上传结果并保存文件元数据；
- 全部文件上传完成后自动创建一个审查运行；
- 为原文件或派生文件生成短时 GET URL；
- 通过 Provider 启动一条贯通全流程的星辰工作流；
- 保存该运行唯一的当前有效 `executeId`；
- 查询同一 `executeId` 的状态和阶段输出；
- 校验并幂等保存材料理解中间结果；
- 校验最终报告 JSON；
- 将结果写入 D1；
- 向前端返回稳定的业务状态和结果。

### 3.3 R2 职责

- 保存原始文件；
- 必要时保存 PDF、文本、CSV 或 JSON 派生件；
- Bucket 保持私有；
- 仅通过绑定或短时签名 URL 访问。

### 3.4 D1 职责

- 保存项目标题和项目状态；
- 保存文件元数据和 R2 对象 Key；
- 保存单一工作流执行 ID、业务阶段和错误状态；
- 保存同一工作流产生的材料理解中间结果 JSON；
- 保存最终报告 JSON；
- 不保存原始文件二进制。

### 3.5 讯飞星辰职责

- 读取 R2 短时 URL 对应的原文件或派生文件；
- 执行 OCR、表格读取和文本理解；
- 自动分类和生成摘要；
- 执行完整性检查；
- 路由到适用领域 Agent；
- 聚合风险并输出标准 JSON；
- 不直接访问 RiskTrace 数据库。

---

## 4. 项目创建与文件上传

### 4.1 项目创建

用户只填写一个字段：

```json
{
  "projectTitle": "海岳精密设备采购付款审查"
}
```

API 创建项目后返回：

```json
{
  "projectId": "project_001",
  "projectTitle": "海岳精密设备采购付款审查",
  "status": "draft",
  "stage": "waiting_for_upload"
}
```

### 4.2 文件上传

前端一次选择全部已有材料。用户不需要提前判断文件属于预算审批、合同、发票还是验收材料。

上传流程：

```text
1. 前端向 API 提交文件名、MIME 和大小
2. API 为每份文件生成 documentId、objectKey 和预签名 PUT URL
3. 浏览器直接将文件上传到私有 R2
4. 前端逐文件调用上传完成确认接口
5. API 使用短时签名的 R2 S3 `HEAD` 请求校验对象存在、大小及可选校验值
6. 当前批次全部完成后，前端调用“批次完成”接口
7. API 自动创建审查运行并启动一条贯通全流程的星辰工作流
```

### 4.3 文件系统字段与 AI 字段边界

以下字段由系统产生，不能由 AI 改写：

- `projectId`；
- `documentId`；
- `fileName`；
- `mimeType`；
- `r2ObjectKey`；
- 文件大小、校验值和上传状态。

以下字段由 AI 生成：

- `materialName`；
- `category`；
- 单份材料 `summary`；
- 项目级 `summary`；
- `completeness`。

项目标题由用户填写，AI 可在分析中引用，但不得覆盖。

### 4.4 R2 Object Key

```text
projects/{projectId}/original/{documentId}/{safeFileName}
projects/{projectId}/derived/{documentId}/{derivedFileName}
projects/{projectId}/outputs/{reviewRunId}/{artifactName}
```

不得直接使用文件名作为唯一 Key。

---

## 5. R2 文件进入星辰工作流

本 Demo 只采用一条文件接入链路：

```text
R2 私有对象
→ Pages Functions 生成短时 GET URL
→ URL 作为星辰工作流开始节点参数
→ OCR、Excel 或文本解析节点读取文件
→ 后续 Agent 使用解析结果和必要的原文件 URL
```

### 5.1 文件清单输入

RiskTrace 向工作流传入系统可信的文件清单：

```json
[
  {
    "documentId": "doc_001",
    "fileName": "预算审批单.pdf",
    "mimeType": "application/pdf",
    "fileUrl": "TEMPORARY_R2_GET_URL",
    "parseStrategy": "ocr"
  },
  {
    "documentId": "doc_002",
    "fileName": "设备采购合同.pdf",
    "mimeType": "application/pdf",
    "fileUrl": "TEMPORARY_R2_GET_URL",
    "parseStrategy": "ocr"
  }
]
```

### 5.2 文件路由策略

| 文件类型 | 进入工作流的内容 | 处理方式 |
|---|---|---|
| PDF、JPG、PNG、WebP | 原文件短时 URL | OCR 或文档解析 |
| XLS、XLSX、CSV | 原文件短时 URL；不兼容时使用 CSV/JSON 派生件 | 表格提取 |
| DOC、DOCX | 优先使用标准化 PDF 或文本派生件 | OCR 或文本解析 |
| PPT、PPTX | 标准化 PDF 派生件 | OCR |
| TXT、MD、JSON | 原文件 URL 或受控文本 | 文本读取 |
| ZIP、RAR | 不进入工作流 | 提示用户解压后重新上传 |

### 5.3 URL 要求

- 只允许访问一个指定对象；
- 只授权 `GET`；
- 使用 HTTPS；
- 有效期必须覆盖该阶段实际执行时间；
- 重试时重新签发；
- 不在日志、D1 或前端错误信息中保存完整签名 URL。

---

## 6. 自动工作流设计

当前 Demo 采用一条星辰工作流和一次连续执行，减少后端编排和数据库复杂度：

```text
材料理解 → 路由 Agent → 领域 Agent → 聚合 Agent
```

必须遵守以下边界：

- 材料理解和领域审查不得分别配置两个工作流 ID；
- 上传批次完成后只调用一次 Provider `createRun`；
- 一个审查运行只保存一个当前有效的 Provider `executeId`；
- `material_analysis_completed` 只是同一工作流的业务阶段，不表示外部工作流已经结束；
- 材料理解中间结果保存后，工作流继续向后执行，不创建“下一阶段任务”；
- 最终报告和材料理解结果属于同一个 `reviewRunId` 下的两类结果快照。

## 6.1 单工作流执行

### 输入

- `projectId`；
- `projectTitle`；
- 系统生成的文件清单；
- 每份文件的短时 GET URL。

### 处理步骤

```text
开始节点
→ 遍历文件
→ 根据文件类型调用 OCR、表格或文本解析工具
→ 识别材料名称
→ 识别材料类别
→ 生成单份材料摘要
→ 汇总项目摘要
→ 检查材料完整性
→ 形成材料理解中间结果
→ 通过阶段回调或 Provider 阶段查询同步给 RiskTrace API
→ 工作流内部继续执行路由 Agent
→ 调用适用的领域 Agent
→ 聚合 Agent 去重、分级并生成报告
→ 输出最终报告 JSON
```

### 材料类别

当前版本只使用少量稳定类别：

```text
采购立项与审批
供应商与寻源
合同与补充协议
订单与执行
交付与验收
发票与付款
其他材料
无法判断
```

不在当前版本中继续拆分复杂二级、三级分类。

## 6.2 材料理解中间结果对象

材料理解中间结果是前端材料概览和同一工作流后续路由、领域审查节点的共同上下文。它不是第二条工作流的启动参数。

```json
{
  "projectTitle": "海岳精密设备采购付款审查",
  "status": "reviewing",
  "stage": "material_analysis_completed",
  "summary": "该项目为设备采购项目，当前已提供采购审批、供应商、合同、交付、发票及付款申请等材料。",
  "materials": [
    {
      "documentId": "doc_001",
      "fileName": "预算审批单.pdf",
      "materialName": "预算审批",
      "category": "采购立项与审批",
      "summary": "审批预算为150万元，采购内容为精密加工设备。"
    },
    {
      "documentId": "doc_002",
      "fileName": "设备采购合同.pdf",
      "materialName": "采购合同",
      "category": "合同与补充协议",
      "summary": "合同金额为133.11万元，付款条件包括到货、安装调试及稳定运行30天。"
    }
  ],
  "completeness": {
    "result": "incomplete",
    "summary": "当前材料基本覆盖采购及付款流程，但缺少安装调试完成证明和稳定运行30天的证明材料。",
    "missingMaterials": [
      "安装调试完成证明",
      "稳定运行30天证明"
    ]
  }
}
```

### 字段约束

| 字段 | 类型 | 说明 |
|---|---|---|
| `projectTitle` | string | 用户填写的项目标题，由 API 注入 |
| `status` | string | 当前统一为 `reviewing` |
| `stage` | string | 材料理解节点完成时为 `material_analysis_completed` |
| `summary` | string | AI 生成的项目简要摘要 |
| `materials` | array | 与已上传文件一一对应 |
| `documentId` | string | 系统字段，必须来自当前项目 |
| `fileName` | string | 系统字段，必须与数据库一致 |
| `materialName` | string | AI 识别的业务材料名称 |
| `category` | string | AI 识别的材料类别 |
| `summary` | string | AI 生成的单份材料摘要 |
| `completeness.result` | string | `complete`、`incomplete` 或 `uncertain` |
| `completeness.summary` | string | AI 对材料完整性的简要说明 |
| `missingMaterials` | string[] | AI 判断可能缺少的材料名称 |

### 材料理解中间结果校验

Pages Functions 在保存前至少执行：

1. JSON 可解析；
2. `materials` 数量不能超过上传文件数量；
3. 每个 `documentId` 必须属于当前项目；
4. `fileName` 使用数据库中的真实值覆盖工作流返回值；
5. `category` 必须属于允许类别；
6. 摘要长度受限；
7. 未识别文件也必须保留，使用“无法判断”；
8. AI 不得新增不存在的文件记录。

校验通过后，API 将结果作为材料理解快照幂等保存；同一星辰工作流继续执行，无需用户确认，也不得创建新的工作流执行实例。

## 6.3 路由、领域审查与聚合

### 输入

以下内容来自同一工作流的上游节点和开始节点参数，不由 RiskTrace 再次发起外部工作流：

- 材料理解中间结果对象；
- 系统可信的原文件清单；
- 原文件或派生文件短时 URL；
- 可选的少量固定审查规则。

### 处理流程

```text
材料理解节点完成
→ 路由 Agent 判断适用审查领域
→ 调用对应领域 Agent 节点
→ 汇总各领域风险结果
→ 聚合 Agent 去重、分级和生成报告
→ 输出最终报告 JSON
```

## 6.4 路由 Agent

路由 Agent 根据材料类别、项目摘要和完整性结果选择需要执行的领域 Agent。

示例路由结果：

```json
{
  "routes": [
    "procurement_approval",
    "supplier_contract",
    "delivery_acceptance",
    "invoice_payment"
  ]
}
```

路由结果仅用于工作流内部控制，当前版本不要求单独保存或展示。

## 6.5 领域 Agent

### 领域 1：采购立项与审批

重点检查：

- 是否存在采购申请、预算审批或必要的采购决策材料；
- 采购内容与审批范围是否明显不一致；
- 关键审批材料是否缺失；
- 文件日期顺序是否存在明显异常。

### 领域 2：供应商与合同

重点检查：

- 供应商、合同主体和签约主体是否一致；
- 合同金额、标的、付款条件和有效期；
- 是否缺少必要补充协议；
- 收款主体或账户是否存在明显异常。

### 领域 3：订单、交付与验收

重点检查：

- 订单是否在合同范围内；
- 交付和验收材料是否能支持合同付款节点；
- 数量、金额和日期是否存在明显不一致；
- 是否缺少安装、调试、验收或运行证明。

### 领域 4：发票与付款

重点检查：

- 发票、付款申请、合同和验收金额是否一致；
- 发票主体、付款主体和合同主体是否一致；
- 付款条件是否已满足；
- 是否存在疑似重复付款或超额付款。

领域 Agent 应优先输出少量、高价值、可解释的风险，不追求一次覆盖全部可能规则。

## 6.6 领域 Agent 输出

每个领域 Agent 使用统一轻量结构：

```json
{
  "domain": "invoice_payment",
  "summary": "付款申请金额与当前验收材料覆盖金额不一致。",
  "findings": [
    {
      "title": "付款条件可能尚未满足",
      "riskLevel": "high",
      "description": "合同约定安装调试并稳定运行30天后付款，但当前未发现对应证明。",
      "relatedDocumentIds": ["doc_002", "doc_006"],
      "recommendation": "补充安装调试完成证明和稳定运行30天证明后再付款。"
    }
  ]
}
```

## 6.7 聚合 Agent

聚合 Agent 负责：

- 合并重复风险；
- 统一风险等级；
- 将相互关联的问题合并描述；
- 保留风险对应的原文件；
- 生成总体摘要和最终建议；
- 标记分析限制；
- 输出最终报告 JSON。

---

## 7. 最终报告对象

当前版本使用轻量报告结构，不拆分复杂事实表和证据表。

```json
{
  "projectTitle": "海岳精密设备采购付款审查",
  "status": "completed",
  "stage": "report_completed",
  "summary": "项目材料基本覆盖采购、合同、交付、发票和付款环节，但关键验收条件证明不足，当前存在付款条件未满足的高风险。",
  "overallRiskLevel": "high",
  "completeness": {
    "result": "incomplete",
    "summary": "缺少安装调试完成证明和稳定运行30天证明。",
    "missingMaterials": [
      "安装调试完成证明",
      "稳定运行30天证明"
    ]
  },
  "findings": [
    {
      "findingId": "finding_001",
      "domain": "delivery_acceptance",
      "title": "合同付款条件证明不足",
      "riskLevel": "high",
      "description": "合同要求设备安装调试并稳定运行30天后支付对应款项，但当前材料只能证明到货。",
      "relatedDocuments": [
        {
          "documentId": "doc_002",
          "fileName": "设备采购合同.pdf"
        },
        {
          "documentId": "doc_006",
          "fileName": "到货验收单.pdf"
        }
      ],
      "recommendation": "补充安装调试完成证明和稳定运行30天证明后再进行付款审核。"
    }
  ],
  "limitations": [
    "当前未接入真实银行账户验证接口",
    "当前未调用税务发票查验服务"
  ]
}
```

### 7.1 最终报告校验

API 保存前执行：

1. JSON Schema 校验；
2. 项目标题由数据库覆盖；
3. `relatedDocuments.documentId` 必须属于当前项目；
4. 文件名由数据库覆盖；
5. 风险等级限制为 `low`、`medium`、`high`、`critical`；
6. 删除重复风险；
7. 限制风险数量和文本长度；
8. 工作流原始输出可保存到 R2 调试对象，不直接作为正式接口响应；
9. 校验失败时不覆盖上一次有效结果。

---

## 8. 状态与阶段设计

`status` 表示项目总体状态，`stage` 表示当前自动流程位置。

### 8.1 status

```text
draft       项目已创建，等待上传
uploading   文件上传中
reviewing   AI 工作流处理中
completed   最终报告已生成
failed      自动流程失败
```

### 8.2 stage

```text
waiting_for_upload
uploading_files
material_analysis_running
material_analysis_completed
domain_review_running
report_aggregating
report_completed
failed
```

### 8.3 前端阶段文案

| stage | 前端文案 |
|---|---|
| `waiting_for_upload` | 等待上传材料 |
| `uploading_files` | 材料上传中 |
| `material_analysis_running` | 正在理解和分类材料 |
| `material_analysis_completed` | 材料理解结果已保存，同一工作流继续审查 |
| `domain_review_running` | 领域 Agent 正在审查 |
| `report_aggregating` | 正在聚合风险并生成报告 |
| `report_completed` | 合规审查完成 |
| `failed` | 审查失败 |

前端不展示模型思维链，只展示阶段、简短处理说明和必要的错误信息。

---

## 9. 后端 API

## 9.1 项目

```text
POST /api/projects
GET  /api/projects
GET  /api/projects/:projectId
```

### 创建项目

```http
POST /api/projects
```

```json
{
  "projectTitle": "海岳精密设备采购付款审查"
}
```

## 9.2 上传

```text
POST /api/projects/:projectId/upload-sessions
POST /api/projects/:projectId/documents/:documentId/complete
POST /api/projects/:projectId/uploads/complete
GET  /api/projects/:projectId/documents
```

`POST /api/projects/:projectId/uploads/complete` 表示用户本次全部材料已上传。该接口完成后自动创建审查运行，不再要求调用单独的“发起审查”接口。

返回：

```json
{
  "projectId": "project_001",
  "reviewRunId": "review_001",
  "status": "reviewing",
  "stage": "material_analysis_running",
  "pollUrl": "/api/projects/project_001/review"
}
```

## 9.3 审查状态与结果

```text
GET  /api/projects/:projectId/review
GET  /api/projects/:projectId/material-analysis
GET  /api/projects/:projectId/report
POST /api/projects/:projectId/review/retry
```

### 状态接口示例

```json
{
  "projectId": "project_001",
  "status": "reviewing",
  "stage": "domain_review_running",
  "progress": 65,
  "message": "正在执行合同、履约验收和付款领域审查",
  "materialAnalysisAvailable": true,
  "reportAvailable": false
}
```

`progress` 是前端展示用的阶段估算值，不表示模型真实计算百分比。

## 9.4 单工作流状态同步

Pages Functions 始终围绕同一个审查运行和当前有效的 `executeId` 同步状态。在前端查询状态或星辰调用阶段回调时，后端执行：

1. 获取或接收同一工作流的当前状态与阶段输出；
2. 将 Provider 状态映射为 RiskTrace 的 `status` 和 `stage`；
3. 材料理解中间结果首次出现时，校验并幂等保存；
4. 最终报告首次出现时，校验并幂等保存；
5. 更新进度、错误和完成时间；
6. 返回最新业务状态。

该过程不得创建“下一阶段任务”，也不得因为进入领域审查而保存第二个 `executeId`。Pages Functions 不需要在请求结束后持续运行；前端轮询、Provider 查询和受控阶段回调都只用于同步同一工作流的状态。

---

## 10. D1 最小数据模型

当前版本只保留四类核心表。

```text
projects
project_documents
review_runs
review_results
```

## 10.1 projects

| 字段 | 说明 |
|---|---|
| `id` | 项目 ID |
| `title` | 用户填写的项目标题 |
| `status` | 项目总体状态 |
| `stage` | 当前流程阶段 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

## 10.2 project_documents

| 字段 | 说明 |
|---|---|
| `id` | documentId |
| `project_id` | 所属项目 |
| `original_name` | 原始文件名 |
| `mime_type` | MIME |
| `size_bytes` | 文件大小 |
| `r2_object_key` | 原文件 Key |
| `derived_object_key` | 可选派生件 Key |
| `upload_status` | uploading/uploaded/failed |
| `material_name` | AI 识别的材料名称，可为空 |
| `category` | AI 识别的材料类别，可为空 |
| `summary` | AI 生成的材料摘要，可为空 |
| `created_at` | 创建时间 |

## 10.3 review_runs

| 字段 | 说明 |
|---|---|
| `id` | reviewRunId |
| `project_id` | 项目 ID |
| `status` | reviewing/completed/failed |
| `stage` | 当前阶段 |
| `provider_execute_id` | 当前有效的单一星辰工作流执行 ID |
| `provider_status` | Provider 原始状态的受控映射值 |
| `progress` | 前端展示用估算值 |
| `material_analysis_saved_at` | 材料理解中间结果保存时间，可为空 |
| `attempt_count` | 当前审查运行的执行尝试次数 |
| `error_code` | 错误码 |
| `error_message` | 错误信息 |
| `started_at` | 开始时间 |
| `finished_at` | 完成时间 |

## 10.4 review_results

| 字段 | 说明 |
|---|---|
| `id` | 结果 ID |
| `review_run_id` | 审查运行 ID |
| `result_type` | `material_analysis` / `final_report`，均来自同一审查运行 |
| `schema_version` | JSON 协议版本 |
| `result_json` | 校验后的 JSON |
| `raw_output_object_key` | 可选，原始输出的 R2 Key |
| `created_at` | 创建时间 |

当前版本不拆分 `extracted_facts`、逐节点 `agent_runs`、`evidence_refs`、`action_tasks` 和 `audit_logs`。材料理解与最终报告通过 `review_results.result_type` 区分，但共同关联同一个 `review_run_id`。后续需要精细查询、人工处置或统计分析时再增加。

---

## 11. 前端交互设计

## 11.1 新建项目

新建页面只包含：

- 项目标题输入框；
- 创建并上传材料按钮。

不显示采购类型、金额、部门、阶段等额外字段。

## 11.2 批量上传

上传区要求：

- 支持一次选择多份文件；
- 展示文件名、大小和上传进度；
- 支持单文件失败重试；
- 支持上传前删除误选文件；
- 不要求用户选择材料分类；
- 全部上传完成后自动进入审查状态。

## 11.3 自动审查进度

前端只展示业务阶段：

```text
材料上传完成
→ 材料理解与自动分类
→ 领域合规审查
→ 风险聚合与报告生成
→ 审查完成
```

不展示每个模型节点、Token、私有推理内容或复杂 Trace。

## 11.4 材料理解结果

当 `material_analysis_completed` 后，前端立即展示：

- 项目摘要；
- 材料数量；
- 每份材料的文件名、材料名称、类别和摘要；
- 完整性结果；
- 缺少材料列表；
- “系统已自动进入合规审查”的状态提示。

当前版本不提供编辑、确认或驳回按钮。

## 11.5 最终报告

报告页面展示：

- 总体风险等级；
- 报告摘要；
- 材料完整性结果；
- 风险事项列表；
- 每项风险的领域、等级、说明、关联文件和建议；
- 分析限制。

当前版本报告为只读，不提供人工处置操作。

---

## 12. 异步运行与轮询

星辰长任务采用异步接口。每个审查运行只保存一个当前有效的 Provider `executeId`，前端只轮询 RiskTrace API，不直接请求星辰，也不区分“材料执行 ID”和“审查执行 ID”。

建议轮询策略：

- 前 30 秒每 2 秒一次；
- 之后每 5 秒一次；
- 页面隐藏时降低频率；
- `completed` 或 `failed` 后停止；
- 页面重新打开后可根据项目 ID 恢复状态。

业务阶段进度建议：

| stage | progress |
|---|---:|
| `material_analysis_running` | 20 |
| `material_analysis_completed` | 40 |
| `domain_review_running` | 65 |
| `report_aggregating` | 85 |
| `report_completed` | 100 |

---

## 13. 异常与重试

### 13.1 文件异常

- 单文件上传失败：只重试该文件；
- 不支持的压缩包：提示解压后重新上传；
- OCR 超时：对长 PDF 分段或生成派生件；
- Excel 无法直接读取 URL：后端生成 CSV/JSON 派生件；
- URL 过期：重新签发并重试当前工作流；
- 某份文件无法解析：保留文件记录，材料类别标记为“无法判断”，继续处理其他材料。

### 13.2 工作流异常

- 创建工作流执行失败：自动重试最多 2 次；
- 返回 JSON 不合法：允许执行一次格式修复或重新运行；
- 材料理解节点失败：同一工作流停止，项目进入 `failed`；
- 个别领域 Agent 失败：聚合报告中增加限制说明，其他结果继续保留；
- 聚合失败：保留已保存的材料理解中间结果；如平台支持节点级重试则重试聚合，否则对该审查运行重新创建一次完整工作流执行并替换当前有效 `executeId`；
- 重试时重新生成全部短时文件 URL。

### 13.3 前端错误展示

错误信息只说明：

- 当前失败阶段；
- 可否重试；
- 是否需要重新上传材料。

不得展示 API Key、签名 URL、工作流内部配置或模型私有推理内容。

---

## 14. AI 输出边界

- AI 可以识别材料名称、类别、摘要和缺失材料；
- AI 可以输出候选风险和建议；
- AI 不得修改用户填写的项目标题；
- AI 不得创建不存在的 `documentId`；
- AI 不得修改文件名、R2 Key 和上传状态；
- AI 完整性结论是分析结果，不表示系统已确认材料绝对缺失；
- AI 风险结论必须关联当前项目中的文件；
- 前端不展示模型思维链；
- API 必须校验后才能保存和对外返回。

当前版本无需人工确认，但仍必须通过系统字段校验、枚举校验和文档归属校验，避免模型输出直接污染业务数据。

---

## 15. 安全与隐私

### 15.1 Secret

以下内容只保存在 Cloudflare Secret：

```text
XFYUN_API_KEY
XFYUN_API_SECRET
XFYUN_FLOW_ID_REVIEW
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
CLOUDFLARE_ACCOUNT_ID
```

### 15.2 文件访问

- R2 Bucket 私有；
- 上传 PUT URL 使用短有效期；
- 工作流 GET URL 只授权单对象和单操作；
- 不在 D1 和日志中保存完整签名 URL；
- 前端不能获取星辰密钥；
- 原文件与派生件保持关联，派生件不得覆盖原文件。

---

## 16. Provider 抽象

业务代码不直接依赖讯飞字段，统一通过 Provider：

```ts
interface ReviewProvider {
  createRun(input: CreateReviewRunInput): Promise<ProviderRun>
  getRun(executeId: string): Promise<ProviderRunResult>
  cancelRun(executeId: string): Promise<void>
}
```

```ts
interface CreateReviewRunInput {
  projectId: string
  reviewRunId: string
  parameters: Record<string, unknown>
}
```

Provider 负责星辰 API 的鉴权、单工作流创建、参数转换、状态转换和阶段结果读取。`createRun` 对每次执行尝试只调用一次，材料理解和领域审查不通过 `flowType` 分拆。R2 签名 URL 的生成仍由 RiskTrace 文件服务负责。

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
4. 上传完成后自动进入材料理解
5. 查看自动分类、摘要和缺失材料
6. 观察系统自动进入领域审查
7. 查看最终报告和关联文件
```

整个演示不包含手工分类、结果确认和风险处置。

---

## 18. 开发顺序

### 阶段 1：项目与上传

- 只包含项目标题的新建项目接口和页面；
- 批量选择文件；
- R2 预签名 PUT；
- 上传完成确认；
- 批次完成后自动创建审查运行。

### 阶段 2：单工作流骨架与材料理解

- R2 短时 GET URL；
- 创建一条贯通全流程的星辰工作流，并先完成其中的材料理解节点；
- 材料理解中间结果 JSON Schema；
- 结果校验和 D1 保存；
- 前端材料列表、摘要和完整性展示。

### 阶段 3：补全同一工作流的领域审查与聚合

- 在阶段 2 的同一工作流中增加路由 Agent；
- 增加 4 个领域 Agent 节点；
- 增加聚合 Agent；
- 最终报告 JSON；
- 报告保存和展示。

### 阶段 4：状态与异常

- 状态轮询；
- 同一 `executeId` 的阶段状态同步；
- 失败重试；
- 页面刷新后恢复；
- 演示数据清理。

### 阶段 5：演示打磨

- 固定黄金案例；
- 控制文件大小和页数；
- 优化进度文案；
- 准备服务异常时的缓存报告；
- 隐藏未完成模块和调试信息。

---

## 19. 验收清单

### 项目与上传

- [ ] 用户创建项目时只需填写项目标题；
- [ ] 用户可以一次选择全部材料；
- [ ] 用户无需手工选择材料类别；
- [ ] 文件直接上传私有 R2；
- [ ] 每个文件有独立 `documentId` 和 R2 Key；
- [ ] 单文件失败可重试；
- [ ] 全部上传完成后只启动一次贯通全流程的星辰工作流。

### 材料理解

- [ ] 每份文件返回材料名称、类别和摘要；
- [ ] 返回项目摘要；
- [ ] 返回完整性结果和缺少材料列表；
- [ ] 材料理解中间结果通过 API 校验并幂等保存；
- [ ] 前端可以在同一工作流继续运行时查看材料理解结果；
- [ ] 无需人工确认，同一工作流即可继续进入领域审查。

### 多 Agent 审查

- [ ] 路由 Agent 能选择适用领域；
- [ ] 领域 Agent 同时参考材料对象和原文件；
- [ ] 聚合 Agent 能生成统一风险报告；
- [ ] 风险关联当前项目中的真实文件；
- [ ] 个别领域失败时报告能标记分析限制；
- [ ] 不展示模型私有思维链。

### 数据与前端

- [ ] D1 保存项目、文件、一个审查运行及其两类结果 JSON；
- [ ] 前端展示稳定的状态和阶段；
- [ ] 页面刷新后可恢复审查进度；
- [ ] 最终报告为只读展示；
- [ ] 当前版本不包含人工确认和处置闭环。

---

## 20. 官方能力依据与技术口径

### Cloudflare R2

- R2 Presigned URLs：<https://developers.cloudflare.com/r2/api/s3/presigned-urls/>
- R2 浏览器直传：<https://developers.cloudflare.com/r2/objects/upload-objects/>
- R2 CORS：<https://developers.cloudflare.com/r2/buckets/cors/>
- Pages Functions Bindings：<https://developers.cloudflare.com/pages/functions/bindings/>

### 讯飞星辰工作流

- 星辰 Agent API 接入：<https://www.xfyun.cn/doc/spark/Agent04-API%E6%8E%A5%E5%85%A5.html>
- 星辰 Agent 开发指南：<https://www.xfyun.cn/doc/spark/Agent03-%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97.html>
- 星辰 Agent FAQ：<https://www.xfyun.cn/doc/spark/Agent06-FAQ.html>

准确技术口径：

> 用户只填写项目标题并一次性上传全部材料。浏览器通过 RiskTrace API 签发的预签名 PUT URL 将文件上传到私有 R2。上传批次完成后，后端只启动一条讯飞星辰工作流并保存一个当前有效的 `executeId`。工作流通过 R2 短时 GET URL 读取文件，先生成材料分类、摘要和完整性结果；RiskTrace API 对该中间结果进行校验和幂等保存，但不创建第二条工作流。随后同一执行实例继续由路由 Agent 选择领域 Agent，各领域 Agent 结合材料对象与原文件完成审查，聚合 Agent 生成最终报告。RiskTrace API 对报告中的字段、枚举和文件引用进行校验后保存 D1，前端通过轮询查看同一运行的进度、中间结果和最终结果。整个流程不需要用户手工分类、确认中间结果或再次点击发起审查。

---

## 21. 最终结论

当前 Demo 应围绕一条最短、最清晰的自动链路建设：

```text
项目标题
→ 全部材料上传
→ 启动一条星辰工作流
→ 自动材料理解并保存中间结果
→ 同一工作流继续领域审查
→ 同一工作流完成风险聚合
→ 报告保存与展示
```

材料理解中间结果只承担三个作用：

1. 向用户说明系统理解了哪些材料；
2. 给出初步完整性判断；
3. 为路由 Agent 和领域 Agent 提供统一上下文。

因此不需要在当前阶段构建复杂事实表、人工确认页、精细证据模型或处置工作台。当前实现必须先确保“一条工作流、一个审查运行、一个当前有效 `executeId`”的自动化主链路闭合，再根据演示效果和真实使用需求逐步增加人工复核、规则配置、证据定位和风险处置能力。
