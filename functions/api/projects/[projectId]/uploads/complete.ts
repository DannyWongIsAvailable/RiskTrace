import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { startProjectReviewWithMock } from '../../../../_shared/mock-review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const run = await startProjectReviewWithMock(env, projectId)

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
      message: '材料上传已完成，Mock 分类结果已生成，正在继续生成报告',
      requestId: data.requestId,
    },
  )
}
