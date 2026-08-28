import type { RequestData, RiskFindingStatus } from '../../_shared/domain'
import { AppError } from '../../_shared/errors'
import { success } from '../../_shared/http'
import { parsePagination } from '../../_shared/input'
import {
  listRiskFindingAttachments,
  listRiskFindings,
} from '../../_shared/risk-finding-repository'
import { serializeRiskFinding } from '../../_shared/serializers'

export const onRequestGet: PagesFunction<Env, string, RequestData> = async ({
  request,
  env,
  data,
}) => {
  const url = new URL(request.url)
  const pagination = parsePagination(url)
  const status = parseStatus(url.searchParams.get('status'))

  const result = await listRiskFindings(env.risktrace_db, {
    status,
    pageSize: pagination.pageSize,
    offset: pagination.offset,
  })
  const attachments = await listRiskFindingAttachments(
    env.risktrace_db,
    result.items.map((item) => item.id),
  )
  const attachmentsByFinding = new Map<string, typeof attachments>()
  for (const attachment of attachments) {
    const bucket = attachmentsByFinding.get(attachment.risk_finding_id) ?? []
    bucket.push(attachment)
    attachmentsByFinding.set(attachment.risk_finding_id, bucket)
  }

  return success(
    {
      items: result.items.map((item) =>
        serializeRiskFinding(item, attachmentsByFinding.get(item.id) ?? []),
      ),
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

function parseStatus(value: string | null): RiskFindingStatus | undefined {
  if (value === null || value === '') return undefined
  if (value === 'pending' || value === 'completed') return value
  throw new AppError('VALIDATION_FAILED', '风险事项状态筛选无效', 400)
}
