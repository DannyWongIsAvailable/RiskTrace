import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { startProjectReview } from '../../../../_shared/review-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')

  // Synchronous contract: this request stays open until the Provider reaches a terminal state
  // and RiskTrace has validated/persisted the final output.
  const run = await startProjectReview(env, { projectId })

  return success(
    {
      projectId,
      reviewRunId: run.id,
      status: run.status,
      stage: run.stage,
      materialAnalysisUrl: `/api/projects/${projectId}/material-analysis`,
      reportUrl: `/api/projects/${projectId}/report`,
      error:
        run.status === 'failed' && run.error_code && run.error_message
          ? { code: run.error_code, message: run.error_message }
          : null,
    },
    {
      status: 200,
      message: run.status === 'completed' ? '完整合规审查已完成' : '合规审查执行失败',
      requestId: data.requestId,
    },
  )
}
