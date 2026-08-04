const PREFIX_PATTERN = /^[a-z][a-z0-9_]{1,20}$/

export function createId(prefix: string): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error('Invalid ID prefix')
  }

  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
