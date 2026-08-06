import { AppError } from './errors'
import { createPresignedR2Url } from './r2-signing'

const STORAGE_REQUEST_TIMEOUT_MS = 8_000
const STORAGE_URL_TTL_SECONDS = 60
const R2_DELETE_BATCH_SIZE = 1000

export interface R2ObjectMetadata {
  size: number
  checksumSha256Base64: string | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export async function headR2Object(
  env: Env,
  objectKey: string,
): Promise<R2ObjectMetadata | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STORAGE_REQUEST_TIMEOUT_MS)

  try {
    const url = await createPresignedR2Url(env, {
      method: 'HEAD',
      objectKey,
      expiresInSeconds: STORAGE_URL_TTL_SECONDS,
    })
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new AppError('R2_HEAD_FAILED', '远端文件校验失败，请稍后重试', 502, {
        storageStatus: response.status,
      })
    }

    const contentLength = response.headers.get('content-length')
    const size = contentLength === null ? Number.NaN : Number(contentLength)

    if (!Number.isSafeInteger(size) || size < 0) {
      throw new AppError('R2_METADATA_INVALID', '远端文件元数据无效，请重新上传', 502)
    }

    return {
      size,
      checksumSha256Base64: response.headers.get('x-amz-checksum-sha256'),
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new AppError(
        'STORAGE_REQUEST_TIMEOUT',
        '对象存储响应超时，请稍后重试',
        504,
      )
    }

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError('STORAGE_REQUEST_FAILED', '对象存储请求失败，请稍后重试', 502)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function deleteR2Objects(env: Env, objectKeys: string[]): Promise<void> {
  const keys = [...new Set(objectKeys)]

  for (let index = 0; index < keys.length; index += R2_DELETE_BATCH_SIZE) {
    await env.risktrace_files.delete(keys.slice(index, index + R2_DELETE_BATCH_SIZE))
  }
}
