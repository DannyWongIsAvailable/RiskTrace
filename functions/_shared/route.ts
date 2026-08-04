import { AppError } from './errors'

export function getPathParam(
  params: Record<string, string | string[]>,
  name: string,
): string {
  const value = params[name]
  if (typeof value !== 'string' || !value) {
    throw new AppError('VALIDATION_FAILED', '路径参数无效', 400)
  }

  return value
}
