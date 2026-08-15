import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { startProjectReview } from '../../../../_shared/review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  request,
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const run = await startProjectReview(env, {
    projectId,
    requestOrigin: new URL(request.url).origin,
  })

  return success(
    {
      projectId,
      reviewRunId: run.id,
      status: run.status,
      stage: run.stage,
      materialAnalysisUrl: `/api/projects/${projectId}/material-analysis`,
      pollUrl: `/api/projects/${projectId}/review`,
      reportUrl: `/api/projects/${projectId}/report`,
    },
    {
      status: 202,
      message: '材料上传已完成，合规审查已启动',
      requestId: data.requestId,
    },
  )
}
