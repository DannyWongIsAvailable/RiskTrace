import {
  COMPLETENESS_RESULTS,
  MATERIAL_CATEGORIES,
  RISK_LEVELS,
  type CompletenessResult,
  type DocumentRow,
  type MaterialAnalysis,
  type MaterialCategory,
  type ProjectRow,
  type ReviewReport,
  type RiskLevel,
} from './domain'
import { AppError } from './errors'

const MAX_FINDINGS = 50
const MAX_LIMITATIONS = 20
const MAX_MISSING_MATERIALS = 30

export interface ParsedProviderOutput {
  materialAnalysis?: unknown
  finalReport?: unknown
  stage?: string
}

export function parseProviderOutput(content: string): ParsedProviderOutput {
  const normalized = stripJsonFence(content.trim())
  if (!normalized) {
    throw invalidOutput('审查执行未返回结果内容')
  }

  let value: unknown
  try {
    value = JSON.parse(normalized)
  } catch {
    throw invalidOutput('审查执行返回结果不是有效 JSON')
  }

  const record = asObject(value)
  if (!record) {
    throw invalidOutput('审查执行返回结果必须是 JSON 对象')
  }

  const nested = asObject(record.data) ?? asObject(record.output) ?? record
  const materialAnalysis = nested.materialAnalysis ?? nested.material_analysis
  const finalReport = nested.finalReport ?? nested.final_report ?? nested.report
  const stage = typeof nested.stage === 'string' ? nested.stage : undefined

  if (materialAnalysis !== undefined || finalReport !== undefined) {
    return { materialAnalysis, finalReport, stage }
  }
  if ('overallRiskLevel' in nested || 'findings' in nested) {
    return { finalReport: nested, stage }
  }
  if ('materials' in nested && 'completeness' in nested) {
    return { materialAnalysis: nested, stage }
  }

  throw invalidOutput('审查执行返回结果缺少材料理解或最终报告')
}

export function normalizeMaterialAnalysis(
  raw: unknown,
  project: ProjectRow,
  documents: DocumentRow[],
): MaterialAnalysis {
  const record = requireObject(raw, '材料理解结果')
  const summary = readRequiredText(record.summary, 'summary', 2_000)
  const rawMaterials = requireArray(record.materials, 'materials')
  if (rawMaterials.length > documents.length) {
    throw invalidOutput('材料理解结果包含过多文件记录')
  }

  const documentById = new Map(documents.map((document) => [document.id, document]))
  const materialByDocumentId = new Map<string, MaterialAnalysis['materials'][number]>()

  rawMaterials.forEach((item, index) => {
    const material = requireObject(item, `materials[${index}]`)
    const documentId = readRequiredText(material.documentId, `materials[${index}].documentId`, 80)
    const document = documentById.get(documentId)
    if (materialByDocumentId.has(documentId)) {
      throw invalidOutput('材料理解结果包含重复文件记录')
    }

    materialByDocumentId.set(documentId, {
      documentId,
      fileName: document?.original_name ?? readOptionalFileName(material.fileName),
      materialName: readRequiredText(
        material.materialName,
        `materials[${index}].materialName`,
        100,
      ),
      category: readMaterialCategory(material.category, `materials[${index}].category`),
      summary: readRequiredText(material.summary, `materials[${index}].summary`, 1_000),
    })
  })

  const materials = documents.map(
    (document): MaterialAnalysis['materials'][number] =>
      materialByDocumentId.get(document.id) ?? {
        documentId: document.id,
        fileName: document.original_name,
        materialName: '未识别材料',
        category: '无法判断',
        summary: '审查执行未能识别该文件内容，已保留文件记录并继续审查其他材料。',
      },
  )

  return {
    projectTitle: project.title,
    status: 'reviewing',
    stage: 'material_analysis_completed',
    summary,
    materials,
    completeness: normalizeCompleteness(record.completeness),
  }
}

export function normalizeReviewReport(
  raw: unknown,
  project: ProjectRow,
  documents: DocumentRow[],
): ReviewReport {
  const record = requireObject(raw, '最终报告')
  const documentById = new Map(documents.map((document) => [document.id, document]))
  const rawFindings = requireArray(record.findings, 'findings')
  if (rawFindings.length > MAX_FINDINGS) {
    throw invalidOutput(`风险事项数量不能超过 ${MAX_FINDINGS}`)
  }

  const uniqueFindings = new Map<string, ReviewReport['findings'][number]>()
  rawFindings.forEach((item, index) => {
    const finding = requireObject(item, `findings[${index}]`)
    const domain = readRequiredText(finding.domain, `findings[${index}].domain`, 80)
    const title = readRequiredText(finding.title, `findings[${index}].title`, 160)
    const description = readRequiredText(
      finding.description,
      `findings[${index}].description`,
      2_000,
    )
    const relatedDocuments = normalizeRelatedDocuments(
      finding.relatedDocuments,
      documentById,
      index,
    )
    const recommendation = readRequiredText(
      finding.recommendation,
      `findings[${index}].recommendation`,
      1_500,
    )
    const riskLevel = readRiskLevel(finding.riskLevel, `findings[${index}].riskLevel`)
    const dedupeKey = [
      domain.toLowerCase(),
      title.toLowerCase(),
      description.toLowerCase(),
      relatedDocuments.map((document) => document.documentId).sort().join(','),
    ].join('|')

    if (!uniqueFindings.has(dedupeKey)) {
      uniqueFindings.set(dedupeKey, {
        findingId: `finding_${stableHash(dedupeKey)}`,
        domain,
        title,
        riskLevel,
        description,
        relatedDocuments,
        recommendation,
      })
    }
  })

  return {
    projectTitle: project.title,
    status: 'completed',
    stage: 'report_completed',
    summary: readRequiredText(record.summary, 'summary', 3_000),
    overallRiskLevel: readRiskLevel(record.overallRiskLevel, 'overallRiskLevel'),
    completeness: normalizeCompleteness(record.completeness),
    findings: [...uniqueFindings.values()],
    limitations: normalizeStringArray(record.limitations, 'limitations', MAX_LIMITATIONS, 300),
  }
}

function normalizeCompleteness(value: unknown): MaterialAnalysis['completeness'] {
  const record = requireObject(value, 'completeness')
  const result = readEnum(
    record.result,
    COMPLETENESS_RESULTS,
    'completeness.result',
  ) as CompletenessResult

  return {
    result,
    summary: readRequiredText(record.summary, 'completeness.summary', 1_500),
    missingMaterials: normalizeStringArray(
      record.missingMaterials,
      'completeness.missingMaterials',
      MAX_MISSING_MATERIALS,
      120,
    ),
  }
}

function normalizeRelatedDocuments(
  value: unknown,
  documentById: Map<string, DocumentRow>,
  findingIndex: number,
): ReviewReport['findings'][number]['relatedDocuments'] {
  const items = requireArray(value, `findings[${findingIndex}].relatedDocuments`)
  const seen = new Set<string>()
  const result: ReviewReport['findings'][number]['relatedDocuments'] = []

  items.forEach((item, documentIndex) => {
    const record = requireObject(
      item,
      `findings[${findingIndex}].relatedDocuments[${documentIndex}]`,
    )
    const documentId = readRequiredText(
      record.documentId,
      `findings[${findingIndex}].relatedDocuments[${documentIndex}].documentId`,
      80,
    )
    const document = documentById.get(documentId)

    if (!seen.has(documentId)) {
      seen.add(documentId)
      result.push({
        documentId,
        fileName: document?.original_name ?? readOptionalFileName(record.fileName),
      })
    }
  })

  return result
}

function normalizeStringArray(
  value: unknown,
  fieldName: string,
  maxItems: number,
  maxLength: number,
): string[] {
  const values = requireArray(value ?? [], fieldName)
  if (values.length > maxItems) {
    throw invalidOutput(`${fieldName}数量超过上限`)
  }

  return [...new Set(values.map((item, index) => readRequiredText(item, `${fieldName}[${index}]`, maxLength)))]
}

function readMaterialCategory(value: unknown, fieldName: string): MaterialCategory {
  return readEnum(value, MATERIAL_CATEGORIES, fieldName) as MaterialCategory
}

function readRiskLevel(value: unknown, fieldName: string): RiskLevel {
  return readEnum(value, RISK_LEVELS, fieldName) as RiskLevel
}

function readEnum(value: unknown, values: readonly string[], fieldName: string): string {
  const text = readRequiredText(value, fieldName, 100)
  if (!values.includes(text)) {
    throw invalidOutput(`${fieldName}枚举值无效`)
  }

  return text
}

function readOptionalFileName(value: unknown): string {
  if (typeof value !== 'string') {
    return '未知文件'
  }

  const text = value.trim()
  return text ? text.slice(0, 255) : '未知文件'
}

function readRequiredText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw invalidOutput(`${fieldName}必须是字符串`)
  }

  const text = value.trim()
  if (!text || text.length > maxLength) {
    throw invalidOutput(`${fieldName}内容为空或超过长度限制`)
  }

  return text
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = asObject(value)
  if (!record) {
    throw invalidOutput(`${fieldName}必须是对象`)
  }

  return record
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw invalidOutput(`${fieldName}必须是数组`)
  }

  return value
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stripJsonFence(value: string): string {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1]?.trim() ?? value
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function invalidOutput(message: string): AppError {
  return new AppError('WORKFLOW_OUTPUT_INVALID', message, 502)
}
