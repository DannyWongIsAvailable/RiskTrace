import { AppError } from './errors'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const REGION = 'auto'
const SERVICE = 's3'
const TERMINATOR = 'aws4_request'
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

interface R2SigningConfig {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
}

export async function createPresignedR2Url(
  env: Env,
  input: {
    method: 'GET' | 'PUT'
    objectKey: string
    expiresInSeconds: number
    signedHeaders?: Record<string, string>
    now?: Date
  },
): Promise<string> {
  const config = resolveConfig(env)
  const now = input.now ?? new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/${TERMINATOR}`
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodePathSegment(config.bucketName)}/${encodeObjectKey(input.objectKey)}`

  const query = new Map<string, string>([
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-Content-Sha256', UNSIGNED_PAYLOAD],
  ])
  const headers = new Map<string, string>([['host', host]])
  for (const [name, value] of Object.entries(input.signedHeaders ?? {})) {
    headers.set(name.toLowerCase(), normalizeHeaderValue(value))
  }
  const signedHeaders = [...headers.keys()].sort().join(';')
  query.set('X-Amz-SignedHeaders', signedHeaders)
  const canonicalQuery = serializeQuery(query)
  const canonicalHeaders = [...headers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('')
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join('\n')
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = await deriveSigningKey(config.secretAccessKey, dateStamp)
  const signature = bytesToHex(await hmac(signingKey, stringToSign))

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function resolveConfig(env: Env): R2SigningConfig {
  const values = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID?.trim(),
    bucketName: env.R2_BUCKET_NAME?.trim(),
    accessKeyId: env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY?.trim(),
  }

  if (!values.accountId || !values.bucketName || !values.accessKeyId || !values.secretAccessKey) {
    throw new AppError('STORAGE_NOT_CONFIGURED', '对象存储尚未完成配置', 500)
  }

  return values
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(encodePathSegment).join('/')
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function serializeQuery(query: Map<string, string>): string {
  return [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join('&')
}

async function deriveSigningKey(secretAccessKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const dateKey = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp)
  const regionKey = await hmac(dateKey, REGION)
  const serviceKey = await hmac(regionKey, SERVICE)
  return hmac(serviceKey, TERMINATOR)
}

async function hmac(key: BufferSource, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(digest)
}

function bytesToHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
