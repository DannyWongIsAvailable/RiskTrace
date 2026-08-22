import type { RequestData } from '../_shared/domain'
import { success } from '../_shared/http'
import { runProviderDiagnostics } from '../_shared/provider-diagnostics'

export const onRequestPost: PagesFunction<Env, string, RequestData> = async ({ env, data }) => {
  const result = await runProviderDiagnostics(env, data.requestId)
  return success(result, { requestId: data.requestId })
}
