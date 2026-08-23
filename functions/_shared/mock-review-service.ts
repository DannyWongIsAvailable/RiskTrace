import type {
  MaterialAnalysis,
  MaterialCategory,
  ReviewReport,
  RiskLevel,
} from './domain'
import { createId } from './ids'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ReviewProvider,
  ReviewProviderFile,
} from './review-provider'

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

/**
 * Local deterministic ReviewProvider used for development and demonstrations.
 *
 * It implements exactly the same provider contract as remote runtimes. Review orchestration does
 * not import, branch on, or otherwise special-case this implementation.
 */
export class MockReviewProvider implements ReviewProvider {
  readonly name = 'mock' as const

  async createRun(input: CreateReviewRunInput): Promise<ProviderRun> {
    const executeId = createMockExecuteId(input.reviewRunId)
    const materialAnalysis = buildMaterialAnalysis(input.projectTitle, input.files)

    return {
      executeId,
      result: {
        state: 'succeeded',
        content: JSON.stringify({
          materialAnalysis,
          finalReport: buildReport(materialAnalysis),
        }),
      },
    }
  }
}

function createMockExecuteId(reviewRunId: string): string {
  return `mock_${Date.now()}_${reviewRunId}`
}

function buildMaterialAnalysis(
  projectTitle: string,
  files: ReviewProviderFile[],
): MaterialAnalysis {
  const materials = files.map((file) => {
    const fileStem = file.fileName.replace(/\.[^.]+$/, '').trim() || file.fileName
    const category = classifyMaterial(file.fileName)

    return {
      documentId: file.documentId,
      fileName: file.fileName,
      materialName: fileStem.slice(0, 120),
      category,
      summary: `根据文件名称初步识别为“${category}”；当前结果未解析文件正文。`,
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
          summary: '当前材料分类显示主要采购与付款环节材料均已覆盖。',
          missingMaterials,
        }
      : {
          result: 'incomplete' as const,
          summary: `当前材料分类显示仍缺少 ${missingMaterials.length} 类关键材料。`,
          missingMaterials,
        }

  return {
    projectTitle,
    status: 'reviewing',
    stage: 'material_analysis_completed',
    summary: `已根据 ${files.length} 份文件完成初步分类和材料完整性检查。`,
    materials,
    completeness,
  }
}

function classifyMaterial(fileName: string): MaterialCategory {
  return CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(fileName))?.category ?? '无法判断'
}

function buildReport(analysis: MaterialAnalysis): ReviewReport {
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
        '当前材料中未识别到采购申请、预算或审批类文件，无法确认采购事项已经履行必要审批。',
        [],
        '补充采购申请、预算审批或采购决策材料，并结合原始材料复核审批链路。',
      ),
    )
  }

  if (contractDocuments.length === 0) {
    findings.push(
      createFinding(
        'supplier_contract',
        '采购合同材料缺失',
        'high',
        '当前材料中未识别到合同或补充协议，无法核验交易主体、金额、标的和付款条件。',
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
        '核对合同付款条款，并补充安装调试完成或稳定运行证明。',
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
      ? `基于当前材料信息识别出 ${findings.length} 项需要关注的材料链路问题，相关结论应结合文件正文进一步复核。`
      : '当前材料分类显示主要环节已覆盖，未发现明显材料缺口；仍应结合文件正文复核关键事实与条件。'

  return {
    projectTitle: analysis.projectTitle,
    status: 'completed',
    stage: 'report_completed',
    summary,
    overallRiskLevel,
    completeness: analysis.completeness,
    findings,
    limitations: [
      '当前审查仅依据可识别的文件名称进行初步分类，未读取或解析文件正文。',
      '当前未接入银行账户、工商信息和税务发票查验服务。',
      '风险结论应结合原始材料正文及必要的外部核验结果进一步复核。',
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
