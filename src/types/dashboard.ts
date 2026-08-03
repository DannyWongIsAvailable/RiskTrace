import type { StatusTone } from './ui'

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
