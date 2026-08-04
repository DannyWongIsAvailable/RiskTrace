import type { RequestData } from '../../../_shared/domain'
import { success } from '../../../_shared/http'
import { getMaterialAnalysis } from '../../../_shared/review-service'
import { getPathParam } from '../../../_shared/route'

export const onRequestGet: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const result = await getMaterialAnalysis(env, projectId)
  return success(result, { requestId: data.requestId })
}
