import type { RequestData } from '../../../_shared/domain'
import { success } from '../../../_shared/http'
import { expectString, readJsonObject } from '../../../_shared/input'
import { listRiskFindingAttachments } from '../../../_shared/risk-finding-repository'
import { completeRiskFinding } from '../../../_shared/risk-finding-service'
import { getPathParam } from '../../../_shared/route'
import { serializeRiskFinding } from '../../../_shared/serializers'

export const onRequestPatch: PagesFunction<Env, 'findingId', RequestData> = async ({
  request,
  params,
  env,
  data,
}) => {
  const findingId = getPathParam(params, 'findingId')
  const body = await readJsonObject(request)
  const result = await completeRiskFinding(env, {
    findingId,
    dispositionMethod: expectString(body.dispositionMethod, 'dispositionMethod', {
      min: 2,
      max: 200,
    }),
    responsiblePerson: expectString(body.responsiblePerson, 'responsiblePerson', {
      min: 1,
      max: 80,
    }),
    rectificationMeasures: expectString(body.rectificationMeasures, 'rectificationMeasures', {
      min: 2,
      max: 2_000,
    }),
    rectificationDescription: expectString(
      body.rectificationDescription,
      'rectificationDescription',
      { min: 2, max: 2_000 },
    ),
    rectifiedAt: expectString(body.rectifiedAt, 'rectifiedAt', { min: 10, max: 40 }),
  })
  const attachments = await listRiskFindingAttachments(env.risktrace_db, [findingId])

  return success(serializeRiskFinding(result.finding, attachments), {
    message: '风险事项已完成处置与整改',
    requestId: data.requestId,
  })
}
