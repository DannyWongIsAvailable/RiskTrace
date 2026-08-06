import {
  applyMaterialAnalysisToDocuments,
  listDocuments,
} from './document-repository'
import type {
  DocumentRow,
  MaterialAnalysis,
  MaterialCategory,
  ReviewReport,
  ReviewRunRow,
  RiskLevel,
} from './domain'
import { AppError } from './errors'
import { createId } from './ids'
import { requireProject } from './project-repository'
import {
  createOrGetReviewRun,
  markMaterialAnalysisSaved,
  requireReviewRunById,
  updateReviewState,
} from './review-repository'
import {
  findReviewResult,
  reviewResultExists,
  upsertReviewResult,
} from './result-repository'

const MOCK_SCHEMA_VERSION = 'mock-v2'
const DOMAIN_REVIEW_DELAY_MS = 2_000
const REPORT_AGGREGATION_DELAY_MS = 4_000
const REPORT_COMPLETION_DELAY_MS = 6_000

const CATEGORY_MISSING_LABELS: Partial<Record<MaterialCategory, string>> = {
  '采购立项与审批': '采购申请或预算审批材料',
  '供应商与寻源': '供应商资料或比价定标材料',
  '合同与补充协议': '采购合同或补充协议',
  '交付与验收': '到货、安装调试或验收证明',
  '发票与付款': '发票或付款申请材料',
}

const CATEGORY_PATTERNS: Array<{
  category: MaterialCategory
  pattern: RegExp
}> = [
  { category: '采购立项与审批', pattern: /(采购申请|立项|预算|审批|决策)/i },
  { category: '供应商与寻源', pattern: /(供应商|询价|比价|定标|招标|投标|资质)/i },
  { category: '合同与补充协议', pattern: /(合同|协议)/i },
  { category: '订单与执行', pattern: /(采购订单|订单|执行单)/i },
  { category: '交付与验收', pattern: /(到货|交付|收货|验收|安装|调试|运行证明)/i },
  { category: '发票与付款', pattern: /(发票|付款|支付|收款|请款|报销)/i },
]

function now(): string {
  return new Date().toISOString()
}

export function isMockReviewRun(run: ReviewRunRow): boolean {
  return (
    run.status === 'reviewing' &&
    run.provider_execute_id === null &&
    run.provider_status === 'running' &&
    run.material_analysis_saved_at !== null
  )
}

export async function startProjectReviewWithMock(
  env: Env,
  projectId: string,
): Promise<ReviewRunRow> {
  const project = await requireProject(env.risktrace_db, projectId)
  const documents = await requireUploadedDocuments(env, projectId)
  const reviewRun = await createOrGetReviewRun(env.risktrace_db, {
    id: createId('review'),
    projectId,
    now: now(),
  })

  if (reviewRun.status === 'completed' || reviewRun.material_analysis_saved_at) {
    return reviewRun
  }

  const timestamp = now()
  const materialAnalysis = buildMockMaterialAnalysis(project.title, documents)

  await upsertReviewResult(env.risktrace_db, {
    reviewRunId: reviewRun.id,
    resultType: 'material_analysis',
    schemaVersion: MOCK_SCHEMA_VERSION,
    result: materialAnalysis,
    now: timestamp,
  })
  await applyMaterialAnalysisToDocuments(
    env.risktrace_db,
    projectId,
    materialAnalysis,
    timestamp,
  )
  await markMaterialAnalysisSaved(env.risktrace_db, {
    reviewRunId: reviewRun.id,
    projectId,
    now: timestamp,
  })

  return requireReviewRunById(env.risktrace_db, reviewRun.id)
}

export async function synchronizeProjectReviewWithMock(
  env: Env,
  run: ReviewRunRow,
): Promise<ReviewRunRow> {
  if (!isMockReviewRun(run) || !run.material_analysis_saved_at) {
    return run
  }

  const savedAt = Date.parse(run.material_analysis_saved_at)
  if (Number.isNaN(savedAt)) {
    throw new AppError('STORED_RESULT_INVALID', 'Mock 材料理解完成时间无效', 500)
  }

  const elapsedMs = Date.now() - savedAt
  const timestamp = now()

  if (elapsedMs >= REPORT_COMPLETION_DELAY_MS) {
    await completeMockReport(env, run, timestamp)
  } else if (
    elapsedMs >= REPORT_AGGREGATION_DELAY_MS &&
    run.stage !== 'report_aggregating'
  ) {
    await updateReviewState(env.risktrace_db, {
      reviewRunId: run.id,
      projectId: run.project_id,
      status: 'reviewing',
      stage: 'report_aggregating',
      providerStatus: 'running',
      progress: 85,
      now: timestamp,
    })
  } else if (
    elapsedMs >= DOMAIN_REVIEW_DELAY_MS &&
    run.stage === 'material_analysis_completed'
  ) {
    await updateReviewState(env.risktrace_db, {
      reviewRunId: run.id,
      projectId: run.project_id,
      status: 'reviewing',
      stage: 'domain_review_running',
      providerStatus: 'running',
      progress: 65,
      now: timestamp,
    })
  }

  return requireReviewRunById(env.risktrace_db, run.id)
}

function buildMockMaterialAnalysis(
  projectTitle: string,
  documents: DocumentRow[],
): MaterialAnalysis {
  const materials = documents.map((document) => {
    const fileStem = document.original_name.replace(/\.[^.]+$/, '').trim() || document.original_name
    const category = classifyMaterial(document.original_name)

    return {
      documentId: document.id,
      fileName: document.original_name,
      materialName: fileStem.slice(0, 120),
      category,
      summary: `Mock 根据文件名识别为“${category}”；当前未解析文件正文。`,
    }
  })

  const presentCategories = new Set(materials.map((material) => material.category))
  const requiredCategories: MaterialCategory[] = [
    '采购立项与审批',
    '供应商与寻源',
    '合同与补充协议',
    '交付与验收',
    '发票与付款',
  ]
  const missingMaterials = requiredCategories
    .filter((category) => !presentCategories.has(category))
    .map((category) => CATEGORY_MISSING_LABELS[category])
    .filter((label): label is string => Boolean(label))

  const hasContract = presentCategories.has('合同与补充协议')
  const hasPayment = presentCategories.has('发票与付款')
  const hasDelivery = presentCategories.has('交付与验收')
  const hasOperationalProof = materials.some(
    (material) =>
      material.category === '交付与验收' &&
      /(安装|调试|稳定运行|运行证明)/i.test(material.fileName),
  )

  if (hasContract && hasPayment && hasDelivery && !hasOperationalProof) {
    missingMaterials.push('安装调试完成证明', '稳定运行30天证明')
  }

  const completeness =
    missingMaterials.length === 0
      ? {
          result: 'complete' as const,
          summary: 'Mock 分类显示主要采购与付款环节材料均已覆盖。',
          missingMaterials,
        }
      : {
          result: 'incomplete' as const,
          summary: `Mock 分类显示仍缺少 ${missingMaterials.length} 类关键材料。`,
          missingMaterials,
        }

  return {
    projectTitle,
    status: 'reviewing',
    stage: 'material_analysis_completed',
    summary: `已根据 ${documents.length} 份文件的名称完成 Mock 分类和材料完整性检查。`,
    materials,
    completeness,
  }
}

function classifyMaterial(fileName: string): MaterialCategory {
  return (
    CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(fileName))?.category ?? '无法判断'
  )
}

async function completeMockReport(
  env: Env,
  run: ReviewRunRow,
  timestamp: string,
): Promise<void> {
  const reportAlreadyExists = await reviewResultExists(
    env.risktrace_db,
    run.id,
    'final_report',
  )

  if (!reportAlreadyExists) {
    const materialResult = await findReviewResult(
      env.risktrace_db,
      run.id,
      'material_analysis',
    )
    if (!materialResult) {
      throw new AppError('STORED_RESULT_INVALID', 'Mock 材料理解结果不存在', 500)
    }

    const analysis = parseMaterialAnalysis(materialResult.result_json)
    const report = buildMockReport(analysis)
    await upsertReviewResult(env.risktrace_db, {
      reviewRunId: run.id,
      resultType: 'final_report',
      schemaVersion: MOCK_SCHEMA_VERSION,
      result: report,
      now: timestamp,
    })
  }

  await updateReviewState(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: run.project_id,
    status: 'completed',
    stage: 'report_completed',
    providerStatus: 'success',
    progress: 100,
    now: timestamp,
    finishedAt: timestamp,
  })
}

function buildMockReport(analysis: MaterialAnalysis): ReviewReport {
  const findings: ReviewReport['findings'] = []
  const materialsByCategory = new Map<MaterialCategory, MaterialAnalysis['materials']>()

  for (const material of analysis.materials) {
    const categoryMaterials = materialsByCategory.get(material.category) ?? []
    categoryMaterials.push(material)
    materialsByCategory.set(material.category, categoryMaterials)
  }

  const approvalDocuments = materialsByCategory.get('采购立项与审批') ?? []
  const supplierDocuments = materialsByCategory.get('供应商与寻源') ?? []
  const contractDocuments = materialsByCategory.get('合同与补充协议') ?? []
  const deliveryDocuments = materialsByCategory.get('交付与验收') ?? []
  const paymentDocuments = materialsByCategory.get('发票与付款') ?? []
  const operationalProofDocuments = deliveryDocuments.filter((material) =>
    /(安装|调试|稳定运行|运行证明)/i.test(material.fileName),
  )

  if (approvalDocuments.length === 0) {
    findings.push(
      createFinding(
        'procurement_approval',
        '采购审批材料缺失',
        'medium',
        'Mock 分类中未识别到采购申请、预算或审批类文件，无法确认采购事项已经履行必要审批。',
        [],
        '补充采购申请、预算审批或采购决策材料后再进行正式审查。',
      ),
    )
  }

  if (contractDocuments.length === 0) {
    findings.push(
      createFinding(
        'supplier_contract',
        '采购合同材料缺失',
        'high',
        'Mock 分类中未识别到合同或补充协议，当前无法核验交易主体、金额、标的和付款条件。',
        [...supplierDocuments, ...paymentDocuments],
        '补充已签署的采购合同及相关补充协议。',
      ),
    )
  }

  if (paymentDocuments.length > 0 && deliveryDocuments.length === 0) {
    findings.push(
      createFinding(
        'delivery_acceptance',
        '付款缺少交付验收支持材料',
        'high',
        '已识别到发票或付款类文件，但未识别到到货、交付、安装调试或验收类证明。',
        [...contractDocuments, ...paymentDocuments],
        '补充与合同付款节点对应的到货、安装调试或验收证明后再审核付款。',
      ),
    )
  } else if (
    paymentDocuments.length > 0 &&
    contractDocuments.length > 0 &&
    operationalProofDocuments.length === 0
  ) {
    findings.push(
      createFinding(
        'delivery_acceptance',
        '合同付款条件证明可能不足',
        'high',
        '已识别到合同、付款和交付验收类文件，但文件名中未发现安装调试或稳定运行证明，需结合正文确认付款条件是否满足。',
        [...contractDocuments, ...deliveryDocuments, ...paymentDocuments],
        '在正式工作流中核对合同付款条款，并补充安装调试完成或稳定运行证明。',
      ),
    )
  }

  if (paymentDocuments.length > 0 && supplierDocuments.length === 0) {
    findings.push(
      createFinding(
        'invoice_payment',
        '供应商与收款主体依据不足',
        'medium',
        '已识别到发票或付款类文件，但未识别到供应商资料或寻源定标材料，无法建立完整的主体核验链路。',
        [...contractDocuments, ...paymentDocuments],
        '补充供应商资质、比价定标或收款主体证明，并核对合同、发票和付款主体一致性。',
      ),
    )
  }

  const overallRiskLevel = getHighestRiskLevel(findings.map((finding) => finding.riskLevel))
  const summary =
    findings.length > 0
      ? `Mock 报告基于文件名分类识别出 ${findings.length} 项需要关注的材料链路问题；正式结论仍需解析文件正文。`
      : 'Mock 分类显示主要材料环节已覆盖，未基于文件名发现明显缺口；正式结论仍需解析文件正文。'

  return {
    projectTitle: analysis.projectTitle,
    status: 'completed',
    stage: 'report_completed',
    summary,
    overallRiskLevel,
    completeness: analysis.completeness,
    findings,
    limitations: [
      '当前 Mock 仅依据文件名进行分类和规则演示，未读取或解析文件正文。',
      '当前未接入银行账户、工商信息和税务发票查验服务。',
      '本报告仅用于验证 Demo 链路，不能作为真实合规决策依据。',
    ],
  }
}

function createFinding(
  domain: string,
  title: string,
  riskLevel: RiskLevel,
  description: string,
  materials: MaterialAnalysis['materials'],
  recommendation: string,
): ReviewReport['findings'][number] {
  const uniqueDocuments = new Map(
    materials.map((material) => [
      material.documentId,
      { documentId: material.documentId, fileName: material.fileName },
    ]),
  )

  return {
    findingId: createId('finding'),
    domain,
    title,
    riskLevel,
    description,
    relatedDocuments: [...uniqueDocuments.values()],
    recommendation,
  }
}

function getHighestRiskLevel(levels: RiskLevel[]): RiskLevel {
  const ranking: Record<RiskLevel, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }

  return levels.reduce<RiskLevel>(
    (highest, level) => (ranking[level] > ranking[highest] ? level : highest),
    'low',
  )
}

function parseMaterialAnalysis(value: string): MaterialAnalysis {
  try {
    return JSON.parse(value) as MaterialAnalysis
  } catch {
    throw new AppError('STORED_RESULT_INVALID', 'Mock 材料理解结果无法读取', 500)
  }
}

async function requireUploadedDocuments(
  env: Env,
  projectId: string,
): Promise<DocumentRow[]> {
  const documents = await listDocuments(env.risktrace_db, projectId)
  if (documents.length === 0) {
    throw new AppError('NO_DOCUMENTS', '请至少上传一份材料后再开始审查', 422)
  }

  const incompleteDocuments = documents.filter(
    (document) => document.upload_status !== 'uploaded',
  )
  if (incompleteDocuments.length > 0) {
    throw new AppError('DOCUMENT_UPLOAD_INCOMPLETE', '仍有材料尚未完成上传确认', 409, {
      documentIds: incompleteDocuments.map((document) => document.id),
    })
  }

  return documents
}
