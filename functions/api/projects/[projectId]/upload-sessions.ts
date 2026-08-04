import type { RequestData } from '../../../_shared/domain'
import { createUploadSession, parseUploadFiles } from '../../../_shared/file-service'
import { success } from '../../../_shared/http'
import { readJsonObject } from '../../../_shared/input'
import { getPathParam } from '../../../_shared/route'

export const onRequestPost: PagesFunction<Env, 'projectId', RequestData> = async ({
  request,
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const body = await readJsonObject(request)
  const files = parseUploadFiles(body.files)
  const uploadSession = await createUploadSession(env, projectId, files)

  return success(uploadSession, {
    status: 201,
    message: '上传地址已生成',
    requestId: data.requestId,
  })
}
