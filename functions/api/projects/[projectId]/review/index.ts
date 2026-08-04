import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { getReviewStatus } from '../../../../_shared/review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestGet: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const review = await getReviewStatus(env, projectId, true)

  return success(review, { requestId: data.requestId })
}
