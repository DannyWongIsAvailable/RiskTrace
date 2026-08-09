import {
  RISK_LEVELS,
  type ProjectStage,
  type ProjectStatus,
  type RiskLevel,
} from './domain'

interface DashboardOverviewRow {
  total_projects: number
  draft_projects: number | null
  uploading_projects: number | null
  reviewing_projects: number | null
  completed_projects: number | null
  failed_projects: number | null
}

interface CountRow {
  total: number
}

interface ReportRow {
  project_id: string
  result_json: string
}

interface RecentProjectRow {
  project_id: string
  project_title: string
  status: ProjectStatus
  stage: ProjectStage
  updated_at: string
  document_count: number
  result_json: string | null
}

interface ParsedReportStats {
  overallRiskLevel: RiskLevel | null
  findingRiskLevels: RiskLevel[]
}

export interface DashboardSummary {
  generatedAt: string
  metrics: {
    totalProjects: number
    totalDocuments: number
    completedReports: number
    totalFindings: number
    highRiskFindings: number
    criticalRiskFindings: number
  }
  projectStatus: Record<ProjectStatus, number>
  reportRiskDistribution: Record<RiskLevel, number>
  findingRiskDistribution: Record<RiskLevel, number>
  recentProjects: Array<{
    projectId: string
    projectTitle: string
    status: ProjectStatus
    stage: ProjectStage
    documentCount: number
    overallRiskLevel: RiskLevel | null
    findingCount: number
    updatedAt: string
  }>
}

export async function getDashboardSummary(db: D1Database): Promise<DashboardSummary> {
  const [overview, documentCount, reportResult, recentResult] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total_projects,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_projects,
           SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END) AS uploading_projects,
           SUM(CASE WHEN status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing_projects,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_projects,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_projects
         FROM projects`,
      )
      .first<DashboardOverviewRow>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM project_documents
         WHERE upload_status = 'uploaded'`,
      )
      .first<CountRow>(),
    db
      .prepare(
        `SELECT r.project_id, result.result_json
         FROM review_results result
         JOIN review_runs r ON r.id = result.review_run_id
         WHERE result.result_type = 'final_report'`,
      )
      .all<ReportRow>(),
    db
      .prepare(
        `SELECT
           p.id AS project_id,
           p.title AS project_title,
           p.status,
           p.stage,
           p.updated_at,
           (
             SELECT COUNT(*)
             FROM project_documents d
             WHERE d.project_id = p.id AND d.upload_status = 'uploaded'
           ) AS document_count,
           (
             SELECT result.result_json
             FROM review_results result
             JOIN review_runs r ON r.id = result.review_run_id
             WHERE r.project_id = p.id AND result.result_type = 'final_report'
             LIMIT 1
           ) AS result_json
         FROM projects p
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT 8`,
      )
      .all<RecentProjectRow>(),
  ])

  const reportRiskDistribution = createRiskLevelCounter()
  const findingRiskDistribution = createRiskLevelCounter()
  const reportStatsByProject = new Map<string, ParsedReportStats>()
  let totalFindings = 0

  for (const row of reportResult.results) {
    const stats = parseReportStats(row.result_json)
    reportStatsByProject.set(row.project_id, stats)

    if (stats.overallRiskLevel) {
      reportRiskDistribution[stats.overallRiskLevel] += 1
    }

    for (const riskLevel of stats.findingRiskLevels) {
      findingRiskDistribution[riskLevel] += 1
      totalFindings += 1
    }
  }

  const projectStatus: Record<ProjectStatus, number> = {
    draft: toNumber(overview?.draft_projects),
    uploading: toNumber(overview?.uploading_projects),
    reviewing: toNumber(overview?.reviewing_projects),
    completed: toNumber(overview?.completed_projects),
    failed: toNumber(overview?.failed_projects),
  }

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      totalProjects: toNumber(overview?.total_projects),
      totalDocuments: toNumber(documentCount?.total),
      completedReports: reportResult.results.length,
      totalFindings,
      highRiskFindings: findingRiskDistribution.high + findingRiskDistribution.critical,
      criticalRiskFindings: findingRiskDistribution.critical,
    },
    projectStatus,
    reportRiskDistribution,
    findingRiskDistribution,
    recentProjects: recentResult.results.map((row) => {
      const stats = row.result_json
        ? (reportStatsByProject.get(row.project_id) ?? parseReportStats(row.result_json))
        : null

      return {
        projectId: row.project_id,
        projectTitle: row.project_title,
        status: row.status,
        stage: row.stage,
        documentCount: toNumber(row.document_count),
        overallRiskLevel: stats?.overallRiskLevel ?? null,
        findingCount: stats?.findingRiskLevels.length ?? 0,
        updatedAt: row.updated_at,
      }
    }),
  }
}

function createRiskLevelCounter(): Record<RiskLevel, number> {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }
}

function parseReportStats(resultJson: string): ParsedReportStats {
  try {
    const parsed: unknown = JSON.parse(resultJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { overallRiskLevel: null, findingRiskLevels: [] }
    }

    const report = parsed as Record<string, unknown>
    const overallRiskLevel = isRiskLevel(report.overallRiskLevel)
      ? report.overallRiskLevel
      : null
    const findingRiskLevels = Array.isArray(report.findings)
      ? report.findings.flatMap((finding) => {
          if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
            return []
          }

          const riskLevel = (finding as Record<string, unknown>).riskLevel
          return isRiskLevel(riskLevel) ? [riskLevel] : []
        })
      : []

    return { overallRiskLevel, findingRiskLevels }
  } catch {
    return { overallRiskLevel: null, findingRiskLevels: [] }
  }
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && RISK_LEVELS.some((riskLevel) => riskLevel === value)
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
