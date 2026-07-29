import { success } from '../_shared/http'

type RequestData = {
  requestId?: string
}

export const onRequestGet: PagesFunction<Env, string, RequestData> = ({ env, data }) =>
  success(
    {
      appName: env.APP_NAME,
      environment: env.APP_ENV,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
    { requestId: data.requestId },
  )
