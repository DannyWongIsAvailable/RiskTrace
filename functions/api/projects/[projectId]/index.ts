import { deleteProjectWithFiles } from '../../../_shared/deletion-service'
import { listDocuments } from '../../../_shared/document-repository'
import type { RequestData } from '../../../_shared/domain'
import { success } from '../../../_shared/http'
import { requireProject } from '../../../_shared/project-repository'
import { deleteR2Objects } from '../../../_shared/r2-object-service'
import { findReviewRunByProject } from '../../../_shared/review-repository'
import { getPathParam } from '../../../_shared/route'
import {
  serializeDocument,
  serializeProject,
  serializeReviewRun,
} from '../../../_shared/serializers'

export const onRequestGet: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const [project, documents, reviewRun] = await Promise.all([
    requireProject(env.risktrace_db, projectId),
    listDocuments(env.risktrace_db, projectId),
    findReviewRunByProject(env.risktrace_db, projectId),
  ])

  return success(
    {
      ...serializeProject(project),
      documents: documents.map(serializeDocument),
      review: reviewRun ? serializeReviewRun(reviewRun) : null,
    },
    { requestId: data.requestId },
  )
}

export const onRequestDelete: PagesFunction<Env, 'projectId', RequestData> = async ({
  params,
  env,
  data,
  waitUntil,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const operation = await deleteProjectWithFiles(env, projectId)

  waitUntil(
    deleteR2Objects(env, operation.objectKeys).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          type: 'r2_cleanup_failed',
          requestId: data.requestId,
          projectId,
          objectCount: operation.objectKeys.length,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : '远端文件后台清理失败',
          timestamp: new Date().toISOString(),
        }),
      )
    }),
  )

  return success(operation.result, {
    message: '采购项目已删除，远端文件正在清理',
    requestId: data.requestId,
  })
}
