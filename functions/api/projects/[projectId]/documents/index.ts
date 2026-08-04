import { listDocuments } from '../../../../_shared/document-repository'
import type { RequestData } from '../../../../_shared/domain'
import { success } from '../../../../_shared/http'
import { requireProject } from '../../../../_shared/project-repository'
import { getPathParam } from '../../../../_shared/route'
import { serializeDocument } from '../../../../_shared/serializers'

export const onRequestGet: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  await requireProject(env.risktrace_db, projectId)
  const documents = await listDocuments(env.risktrace_db, projectId)

  return success(
    {
      projectId,
      items: documents.map(serializeDocument),
      total: documents.length,
    },
    { requestId: data.requestId },
  )
}
