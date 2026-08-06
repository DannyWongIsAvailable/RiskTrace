import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { completeProjectReviewWithMock } from '../../../../_shared/mock-review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const run = await completeProjectReviewWithMock(env, projectId)

  return success(
    {
      projectId,
      reviewRunId: run.id,
      status: run.status,
      stage: run.stage,
      reportUrl: `/api/projects/${projectId}/report`,
    },
    {
      message: '材料上传已完成，MVP Mock 报告已生成',
      requestId: data.requestId,
    },
  )
}
