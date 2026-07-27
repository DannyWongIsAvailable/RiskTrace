import { http } from '@/api/request'

export interface HealthInfo {
  appName: string
  environment: string
  status: 'healthy' | 'degraded'
  timestamp: string
}

export function getHealth(signal?: AbortSignal): Promise<HealthInfo> {
  return http.get<HealthInfo>('/api/health', { signal })
}
