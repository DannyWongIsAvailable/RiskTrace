import { AppError } from './errors'

const JSON_CONTENT_TYPE_PATTERN = /^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!JSON_CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new AppError('INVALID_CONTENT_TYPE', '请求必须使用 JSON 格式', 415)
  }

  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new AppError('INVALID_JSON', '请求 JSON 格式无效', 400)
  }

  return expectObject(value, '请求体')
}

export function expectObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('VALIDATION_FAILED', `${fieldName}必须是对象`, 422)
  }

  return value as Record<string, unknown>
}

export function expectArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_FAILED', `${fieldName}必须是数组`, 422)
  }

  return value
}

export function expectString(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; trim?: boolean } = {},
): string {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_FAILED', `${fieldName}必须是字符串`, 422)
  }

  const normalized = options.trim === false ? value : value.trim()
  const min = options.min ?? 0
  const max = options.max ?? Number.MAX_SAFE_INTEGER

  if (normalized.length < min || normalized.length > max) {
    throw new AppError('VALIDATION_FAILED', `${fieldName}长度必须在 ${min} 到 ${max} 个字符之间`, 422)
  }

  return normalized
}

export function expectPositiveInteger(
  value: unknown,
  fieldName: string,
  options: { max?: number } = {},
): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new AppError('VALIDATION_FAILED', `${fieldName}必须是正整数`, 422)
  }

  if (options.max !== undefined && value > options.max) {
    throw new AppError('VALIDATION_FAILED', `${fieldName}超过允许上限`, 422)
  }

  return value
}

export function optionalString(
  value: unknown,
  fieldName: string,
  options: { max?: number } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return expectString(value, fieldName, { min: 1, max: options.max })
}

export function parsePagination(url: URL): { page: number; pageSize: number; offset: number } {
  const page = parseIntegerQuery(url.searchParams.get('page'), 1, 1, 10_000)
  const pageSize = parseIntegerQuery(url.searchParams.get('pageSize'), 20, 1, 100)

  return { page, pageSize, offset: (page - 1) * pageSize }
}

function parseIntegerQuery(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw === '') {
    return fallback
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError('VALIDATION_FAILED', '分页参数无效', 400)
  }

  return value
}
