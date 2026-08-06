import { listDocuments } from './document-repository'
import { requireProject } from './project-repository'
import { createId } from './ids'
import { upsertReviewResult } from './result-repository'
import {
  createOrGetReviewRun,
  requireReviewRunById,
  updateReviewState,
} from './review-repository'
import type { MaterialAnalysis, ReviewReport, ReviewRunRow } from './domain'

function now(): string {
  return new Date().toISOString()
}

export async function completeProjectReviewWithMock(
  env: Env,
  projectId: string,
): Promise<ReviewRunRow> {
  const project = await requireProject(env.risktrace_db, projectId)

  const reviewRun = await createOrGetReviewRun(env.risktrace_db, {
    id: createId('review'),
    projectId,
    now: now(),
  })

  const documents = await listDocuments(env.risktrace_db, projectId)

  const timestamp = now()

  const materialAnalysis: MaterialAnalysis = {
    projectTitle: project.title,
    status: 'reviewing',
    stage: 'material_analysis_completed',
    summary: 'MVP Mock 已完成材料识别。',
    materials: documents.map((doc) => ({
      documentId: doc.id,
      fileName: doc.original_name,
      materialName: doc.original_name,
      category: '其他材料',
      summary: 'Mock 分析结果。',
    })),
    completeness: {
      result: documents.length > 0 ? 'complete' : 'uncertain',
      summary: documents.length > 0 ? '已上传材料可用于 Mock 审查。' : '暂无材料。',
      missingMaterials: [],
    },
  }

  const report: ReviewReport = {
    projectTitle: project.title,
    status: 'completed',
    stage: 'report_completed',
    summary: 'MVP Mock 合规审查报告。',
    overallRiskLevel: 'medium',
    completeness: materialAnalysis.completeness,
    findings: [],
    limitations: ['当前结果由 MVP Mock 服务生成，不代表真实专家审查意见。'],
  }

  await upsertReviewResult(env.risktrace_db, {
    reviewRunId: reviewRun.id,
    resultType: 'material_analysis',
    schemaVersion: 'mock-v1',
    result: materialAnalysis,
    now: timestamp,
  })

  await upsertReviewResult(env.risktrace_db, {
    reviewRunId: reviewRun.id,
    resultType: 'final_report',
    schemaVersion: 'mock-v1',
    result: report,
    now: timestamp,
  })

  await updateReviewState(env.risktrace_db, {
    reviewRunId: reviewRun.id,
    projectId,
    status: 'completed',
    stage: 'report_completed',
    providerStatus: 'success',
    progress: 100,
    now: timestamp,
    finishedAt: timestamp,
  })

  return requireReviewRunById(env.risktrace_db, reviewRun.id)
}
