import type { RequestData } from '../../../../../_shared/domain'
import { confirmDocumentUpload } from '../../../../../_shared/file-service'
import { success } from '../../../../../_shared/http'
import { getPathParam } from '../../../../../_shared/route'
import { serializeDocument } from '../../../../../_shared/serializers'

export const onRequestPost: PagesFunction<
  Env,
  'projectId' | 'documentId',
  RequestData
> = async ({ params, env, data }) => {
  const projectId = getPathParam(params, 'projectId')
  const documentId = getPathParam(params, 'documentId')
  const document = await confirmDocumentUpload(env, projectId, documentId)

  return success(serializeDocument(document), {
    message: '材料上传已确认',
    requestId: data.requestId,
  })
}
