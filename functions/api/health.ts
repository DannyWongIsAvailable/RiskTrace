import { success } from '../_shared/http'

interface Env {
  APP_NAME?: string
  APP_ENV?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return success({
    appName: context.env.APP_NAME ?? 'RiskTrace',
    environment: context.env.APP_ENV ?? 'development',
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
  })
}
