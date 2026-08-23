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
  const run = await retryProjectReview(env, { projectId })

  return success(
    {
      projectId,
      reviewRunId: run.id,
      status: run.status,
      stage: run.stage,
      attemptCount: run.attempt_count,
      error:
        run.status === 'failed' && run.error_code && run.error_message
          ? { code: run.error_code, message: run.error_message }
          : null,
    },
    {
      status: run.status === 'reviewing' ? 202 : 200,
      message:
        run.status === 'reviewing'
          ? '合规审查重试任务已提交'
          : run.status === 'completed'
            ? '完整合规审查已重新执行完成'
            : '合规审查重试失败',
      requestId: data.requestId,
    },
  )
}
