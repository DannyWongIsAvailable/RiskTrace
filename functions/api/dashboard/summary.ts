import { getDashboardSummary } from '../../_shared/dashboard-repository'
import type { RequestData } from '../../_shared/domain'
import { success } from '../../_shared/http'

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({ env, data }) => {
  const summary = await getDashboardSummary(env.risktrace_db)
  return success(summary, { requestId: data.requestId })
}
