import { request } from './request'

export interface HealthInfo {
  appName: string
  environment: string
  status: string
  timestamp: string
}

export function getHealth(): Promise<HealthInfo> {
  return request<HealthInfo>('/api/health')
}