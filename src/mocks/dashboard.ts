import type { ActivityItem, DashboardMetric, RiskCaseSummary } from '@/types/dashboard'

export const dashboardMetrics: DashboardMetric[] = [
  {
    key: 'events',
    label: '今日分析事件',
    value: '26',
    description: '覆盖合同、订单、发票与付款环节',
    trend: '较昨日 +4',
    trendDirection: 'up',
    tone: 'primary',
  },
  {
    key: 'risks',
    label: '发现风险事件',
    value: '8',
    description: '其中 2 项达到重大风险等级',
    trend: '风险率 30.8%',
    trendDirection: 'flat',
    tone: 'warning',
  },
  {
    key: 'review',
    label: '待人工复核',
    value: '5',
    description: '最长待处理时间 1 小时 24 分钟',
    trend: '较昨日 -2',
    trendDirection: 'down',
    tone: 'neutral',
  },
  {
    key: 'blocked',
    label: '已拦截风险付款',
    value: '¥2,816,400',
    description: '当前统计周期内累计金额',
    trend: '涉及 3 家供应商',
    trendDirection: 'flat',
    tone: 'danger',
  },
]

export const topRiskCases: RiskCaseSummary[] = [
  {
    id: 'rt-case-2026-001',
    caseNo: 'RT-CASE-2026-001',
    title: '海岳精密设备采购异常付款事件',
    supplier: '海岳精密设备有限公司',
    amount: '¥1,331,100',
    riskScore: 92,
    riskLevel: '重大风险',
    status: '待复核',
    updatedAt: '10:22',
  },
  {
    id: 'rt-case-2026-002',
    caseNo: 'RT-CASE-2026-002',
    title: '同一供应商短周期重复开票',
    supplier: '华北工业服务有限公司',
    amount: '¥685,000',
    riskScore: 78,
    riskLevel: '高风险',
    status: '处理中',
    updatedAt: '09:47',
  },
  {
    id: 'rt-case-2026-003',
    caseNo: 'RT-CASE-2026-003',
    title: '验收材料缺失且付款比例异常',
    supplier: '恒明自动化科技有限公司',
    amount: '¥436,800',
    riskScore: 66,
    riskLevel: '高风险',
    status: '待补件',
    updatedAt: '09:16',
  },
]

export const recentActivities: ActivityItem[] = [
  {
    id: 'activity-1',
    title: '交易核验完成',
    description: '检测到付款账户与合同备案账户不一致',
    time: '10:21',
    tone: 'danger',
  },
  {
    id: 'activity-2',
    title: '流程行为分析完成',
    description: '同一采购项目在 48 小时内拆分为三笔订单',
    time: '10:21',
    tone: 'warning',
  },
  {
    id: 'activity-3',
    title: '重大风险事件已生成',
    description: '系统建议暂缓付款并升级合规负责人复核',
    time: '10:22',
    tone: 'danger',
  },
  {
    id: 'activity-4',
    title: '人工反馈已记录',
    description: '账户变更类案例已进入相似案例库',
    time: '09:54',
    tone: 'success',
  },
]
