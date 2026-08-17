import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { retryProjectReview } from '../../../../_shared/review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const run = await retryProjectReview(env, {
    projectId,
  })

  return success(
    {
      projectId,
      reviewRunId: run.id,
      status: run.status,
      stage: run.stage,
      attemptCount: run.attempt_count,
      pollUrl: `/api/projects/${projectId}/review`,
    },
    {
      status: 202,
      message: '完整合规审查工作流已重新启动',
      requestId: data.requestId,
    },
  )
}
