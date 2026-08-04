import { listDocuments } from '../../../_shared/document-repository'
import type { RequestData } from '../../../_shared/domain'
import { success } from '../../../_shared/http'
import { requireProject } from '../../../_shared/project-repository'
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
