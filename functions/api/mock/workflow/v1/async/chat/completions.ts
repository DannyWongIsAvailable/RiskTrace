import {
  mockXingchenChatCompletions,
  type MockXingchenChatRequest,
} from '../../../../../../_shared/mock-xingchen'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Demo-only endpoint.
 *
 * It intentionally keeps the Xingchen async-chat request/response naming,
 * but finishes synchronously so the RiskTrace Demo does not need polling.
 *
 * POST /api/mock/workflow/v1/async/chat/completions
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: MockXingchenChatRequest

  try {
    body = (await context.request.json()) as MockXingchenChatRequest
  } catch {
    return json(
      {
        code: 40000,
        message: 'Invalid JSON body',
        id: `mock_sid_${crypto.randomUUID()}`,
      },
      400,
    )
  }

  if (!body.flow_id || typeof body.flow_id !== 'string') {
    return json(
      {
        code: 40001,
        message: 'flow_id is required',
        id: `mock_sid_${crypto.randomUUID()}`,
      },
      400,
    )
  }

  return json(mockXingchenChatCompletions(body))
}
