/**
 * RiskTrace Demo-only Xingchen-shaped mock.
 *
 * Goal:
 * - Keep the request/response envelope close to iFlytek Xingchen Workflow async API.
 * - Do NOT require a result-polling endpoint in Demo mode.
 * - Complete material analysis + final report in one server-side invocation.
 *
 * Production Xingchen:
 *   POST /workflow/v1/async/chat/completions
 *   -> { code, message, id, data: { execute_id } }
 *   -> final output retrieval / async result query
 *
 * Demo Mock:
 *   mockXingchenChatCompletions(...)
 *   -> same top-level envelope + execute_id
 *   -> data.status = "success"
 *   -> data.output.content contains the two RiskTrace business outputs
 */

export type MockXingchenStatus = 'success'

export interface MockXingchenChatRequest {
  flow_id: string
  uid?: string
  parameters?: Record<string, unknown>
  ext?: Record<string, unknown>
  chat_id?: string
}

export interface MockXingchenOutputContent {
  materialAnalysis: {
    summary: string
    materials: Array<{
      documentId: string
      materialName: string
      category: string
      summary: string
    }>
    completeness: {
      result: 'complete' | 'incomplete' | 'unknown'
      summary: string
      missingMaterials: string[]
    }
  }
  finalReport: {
    summary: string
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical'
    completeness: {
      result: 'complete' | 'incomplete' | 'unknown'
      summary: string
      missingMaterials: string[]
    }
    findings: Array<{
      domain: string
      title: string
      riskLevel: 'low' | 'medium' | 'high' | 'critical'
      description: string
      relatedDocuments: Array<{ documentId: string }>
      recommendation: string
    }>
    limitations: string[]
  }
}

export interface MockXingchenChatResponse {
  code: 0
  message: 'Success'
  id: string
  data: {
    execute_id: string
    status: MockXingchenStatus
    output: {
      content: MockXingchenOutputContent
    }
  }
}

interface FileMeta {
  documentId: string
  fileName: string
  mimeType?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseFiles(parameters: Record<string, unknown>): FileMeta[] {
  const raw = parameters.FILES_JSON ?? parameters.FILES_META_JSON

  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        documentId: asString(item.documentId),
        fileName: asString(item.fileName),
        mimeType: asString(item.mimeType),
      }))
      .filter((item) => item.documentId && item.fileName)
  }

  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            documentId: asString(item.documentId),
            fileName: asString(item.fileName),
            mimeType: asString(item.mimeType),
          }))
          .filter((item) => item.documentId && item.fileName)
      : []
  } catch {
    return []
  }
}

function inferCategory(fileName: string): string {
  const name = fileName.toLowerCase()

  if (/合同|协议|contract/.test(name)) return '合同与补充协议'
  if (/验收|到货|交付|accept|delivery/.test(name)) return '交付与验收'
  if (/发票|invoice/.test(name)) return '发票与税务'
  if (/付款|支付|payment/.test(name)) return '付款材料'
  if (/供应商|supplier|vendor/.test(name)) return '供应商资料'
  if (/预算|审批|申请|budget|approval/.test(name)) return '采购审批'
  if (/比价|定标|报价|quote|bid/.test(name)) return '比价与定标'
  if (/订单|purchase.?order|(^|[^a-z])po([^a-z]|$)/.test(name)) return '采购订单'

  return '其他采购材料'
}

function buildMaterialAnalysis(
  projectTitle: string,
  files: FileMeta[],
): MockXingchenOutputContent['materialAnalysis'] {
  const materials = files.map((file) => ({
    documentId: file.documentId,
    materialName: file.fileName.replace(/\.[^.]+$/, ''),
    category: inferCategory(file.fileName),
    summary: `Mock 已识别文件“${file.fileName}”，用于演示材料分类、摘要和后续审查链路。`,
  }))

  const categories = new Set(materials.map((item) => item.category))
  const missingMaterials: string[] = []

  if (!categories.has('合同与补充协议')) missingMaterials.push('采购合同或补充协议')
  if (!categories.has('交付与验收')) missingMaterials.push('交付或验收证明')
  if (!categories.has('付款材料')) missingMaterials.push('付款申请或付款依据')

  const result = missingMaterials.length > 0 ? 'incomplete' : 'complete'

  return {
    summary: `${projectTitle || '当前采购项目'}共识别 ${materials.length} 份材料；本结果为 Demo Mock，用于验证与正式工作流一致的数据契约。`,
    materials,
    completeness: {
      result,
      summary:
        result === 'complete'
          ? '当前 Demo 规则未发现关键材料缺失。'
          : `当前 Demo 规则发现 ${missingMaterials.length} 类关键材料尚未提供。`,
      missingMaterials,
    },
  }
}

function buildFinalReport(
  materialAnalysis: MockXingchenOutputContent['materialAnalysis'],
): MockXingchenOutputContent['finalReport'] {
  const findings: MockXingchenOutputContent['finalReport']['findings'] = []
  const docs = materialAnalysis.materials

  const contract = docs.find((item) => item.category === '合同与补充协议')
  const acceptance = docs.find((item) => item.category === '交付与验收')
  const payment = docs.find((item) => item.category === '付款材料')

  if (contract && !acceptance) {
    findings.push({
      domain: '履约验收',
      title: '付款前置验收材料不足',
      riskLevel: 'high',
      description: '已识别合同类材料，但当前材料集中未识别到交付或验收证明，付款条件是否满足缺少充分材料支持。',
      relatedDocuments: [{ documentId: contract.documentId }],
      recommendation: '补充到货、安装调试或验收证明，并核对其是否满足合同约定的付款前置条件。',
    })
  }

  if (payment && !contract) {
    findings.push({
      domain: '合同合规',
      title: '付款依据与合同约束无法完整核对',
      riskLevel: 'medium',
      description: '已识别付款材料，但当前材料集中未识别到采购合同或补充协议，无法完整核对付款条件、金额与收款主体。',
      relatedDocuments: [{ documentId: payment.documentId }],
      recommendation: '补充采购合同及相关补充协议后再核对付款条件。',
    })
  }

  if (findings.length === 0 && docs.length > 0) {
    findings.push({
      domain: '综合审查',
      title: 'Demo Mock 未发现预置高风险条件',
      riskLevel: 'low',
      description: '基于文件名和 Demo 规则未触发预置高风险条件；该结论仅用于演示接口与页面，不代表真实合规意见。',
      relatedDocuments: [{ documentId: docs[0].documentId }],
      recommendation: '正式环境应由讯飞星辰工作流结合原始文件内容完成领域审查。',
    })
  }

  const overallRiskLevel =
    findings.some((item) => item.riskLevel === 'critical')
      ? 'critical'
      : findings.some((item) => item.riskLevel === 'high')
        ? 'high'
        : findings.some((item) => item.riskLevel === 'medium')
          ? 'medium'
          : 'low'

  return {
    summary:
      findings.length === 0
        ? '当前没有足够材料生成 Demo 风险事项。'
        : `Demo Mock 共生成 ${findings.length} 项风险/提示，用于验证正式 ReviewReport 契约。`,
    overallRiskLevel,
    completeness: materialAnalysis.completeness,
    findings,
    limitations: ['当前为 Demo Mock：仅按文件元数据和预置规则生成，不读取文件正文，不替代正式星辰工作流审查。'],
  }
}

export function mockXingchenChatCompletions(
  input: MockXingchenChatRequest,
): MockXingchenChatResponse {
  const parameters = input.parameters ?? {}
  const projectTitle = asString(parameters.PROJECT_TITLE)
  const files = parseFiles(parameters)

  const materialAnalysis = buildMaterialAnalysis(projectTitle, files)
  const finalReport = buildFinalReport(materialAnalysis)

  return {
    code: 0,
    message: 'Success',
    id: `mock_sid_${crypto.randomUUID()}`,
    data: {
      execute_id: `mock_execute_${crypto.randomUUID()}`,
      status: 'success',
      output: {
        content: {
          materialAnalysis,
          finalReport,
        },
      },
    },
  }
}
