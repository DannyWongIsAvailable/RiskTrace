import { success } from '../_shared/http'
import type { RequestData } from '../_shared/domain'

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({ env, data }) => {
  const database = await env.risktrace_db.prepare('SELECT 1 AS ok').first<{ ok: number }>()

  return success(
    {
      appName: env.APP_NAME,
      environment: env.APP_ENV,
      status: database?.ok === 1 ? 'healthy' : 'degraded',
      services: {
        database: database?.ok === 1 ? 'available' : 'unavailable',
        objectStorage: env.risktrace_files ? 'configured' : 'unavailable',
        reviewProvider:
          env.XFYUN_API_KEY && env.XFYUN_API_SECRET && env.XFYUN_FLOW_ID_REVIEW
            ? 'configured'
            : 'unconfigured',
      },
      timestamp: new Date().toISOString(),
    },
    { requestId: data.requestId },
  )
}
