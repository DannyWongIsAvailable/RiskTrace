import { deleteProjectDocumentWithFile } from '../../../../../_shared/deletion-service'
import type { RequestData } from '../../../../../_shared/domain'
import { success } from '../../../../../_shared/http'
import { deleteR2Objects } from '../../../../../_shared/r2-object-service'
import { getPathParam } from '../../../../../_shared/route'

export const onRequestDelete: PagesFunction<
  Env,
  'projectId' | 'documentId',
  RequestData
> = async ({ params, env, data, waitUntil }) => {
  const projectId = getPathParam(params, 'projectId')
  const documentId = getPathParam(params, 'documentId')
  const operation = await deleteProjectDocumentWithFile(env, projectId, documentId)

  waitUntil(
    deleteR2Objects(env, operation.objectKeys).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          type: 'r2_cleanup_failed',
          requestId: data.requestId,
          projectId,
          documentId,
          objectCount: operation.objectKeys.length,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : '远端文件后台清理失败',
          timestamp: new Date().toISOString(),
        }),
      )
    }),
  )

  return success(operation.result, {
    message: '项目材料已删除，远端文件正在清理',
    requestId: data.requestId,
  })
}
