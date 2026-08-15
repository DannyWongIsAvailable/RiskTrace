import type { ProjectStage, ProjectStatus, RiskLevel } from './project'
import type { StatusTone } from './ui'

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
  recentProjects: DashboardRecentProject[]
}

export interface DashboardRecentProject {
  projectId: string
  projectTitle: string
  status: ProjectStatus
  stage: ProjectStage
  documentCount: number
  overallRiskLevel: RiskLevel | null
  findingCount: number
  updatedAt: string
}

// 保留旧演示类型，待历史演示数据完成清理后统一移除。
export interface DashboardMetric {
  key: string
  label: string
  value: string
  description: string
  trend?: string
  trendDirection?: 'up' | 'down' | 'flat'
  tone?: StatusTone
}

export interface RiskFindingSummary {
  id: string
  findingNo: string
  title: string
  supplier: string
  amount: string
  riskScore: number
  riskLevel: '高风险' | '重大风险' | '中风险'
  status: '待复核' | '处理中' | '待补件'
  updatedAt: string
}

export interface ActivityItem {
  id: string
  title: string
  description: string
  time: string
  tone: StatusTone
}
