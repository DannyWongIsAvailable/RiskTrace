import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { readJsonObject } from '../../../../_shared/input'
import {
  createRiskFindingAttachmentUploadSession,
  parseRiskFindingAttachmentFiles,
} from '../../../../_shared/risk-finding-service'
import { getPathParam } from '../../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'findingId', RequestData> = async ({
  request,
  params,
  env,
  data,
}) => {
  const findingId = getPathParam(params, 'findingId')
  const body = await readJsonObject(request)
  const files = parseRiskFindingAttachmentFiles(body.files)
  const session = await createRiskFindingAttachmentUploadSession(env, findingId, files)

  return success(session, {
    status: 201,
    message: '证明材料上传地址已生成',
    requestId: data.requestId,
  })
}
