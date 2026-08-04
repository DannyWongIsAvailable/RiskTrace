import { success } from '../../_shared/http'
import { createId } from '../../_shared/ids'
import { expectString, parsePagination, readJsonObject } from '../../_shared/input'
import { createProject, listProjects } from '../../_shared/project-repository'
import type { RequestData } from '../../_shared/domain'
import { serializeProject } from '../../_shared/serializers'

export const onRequestPost: PagesFunction<Env, string, RequestData> = async ({
  request,
  env,
  data,
}) => {
  const body = await readJsonObject(request)
  const projectTitle = expectString(body.projectTitle, 'projectTitle', { min: 2, max: 120 })
  const now = new Date().toISOString()
  const project = await createProject(env.risktrace_db, {
    id: createId('project'),
    title: projectTitle,
    now,
  })

  return success(serializeProject(project), {
    status: 201,
    message: '采购项目已创建',
    requestId: data.requestId,
  })
}

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({
  request,
  env,
  data,
}) => {
  const url = new URL(request.url)
  const pagination = parsePagination(url)
  const result = await listProjects(env.risktrace_db, pagination)

  return success(
    {
      items: result.items.map(serializeProject),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pagination.pageSize),
      },
    },
    { requestId: data.requestId },
  )
}
