import { http } from '@/api/request'
import type { DashboardSummary } from '@/types/dashboard'

export function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  return http.get<DashboardSummary>('/api/dashboard/summary', { signal })
}
