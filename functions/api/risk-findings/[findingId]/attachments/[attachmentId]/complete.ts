import type { RequestData } from '../../../../../_shared/domain'
import { success } from '../../../../../_shared/http'
import { confirmRiskFindingAttachmentUpload } from '../../../../../_shared/risk-finding-service'
import { getPathParam } from '../../../../../_shared/route'
import { serializeRiskFindingAttachment } from '../../../../../_shared/serializers'

export const onRequestPost: PagesFunction<
  Env,
  'findingId' | 'attachmentId',
  RequestData
> = async ({ params, env, data }) => {
  const findingId = getPathParam(params, 'findingId')
  const attachmentId = getPathParam(params, 'attachmentId')
  const attachment = await confirmRiskFindingAttachmentUpload(env, findingId, attachmentId)

  return success(serializeRiskFindingAttachment(attachment), {
    message: '证明材料上传已确认',
    requestId: data.requestId,
  })
}
