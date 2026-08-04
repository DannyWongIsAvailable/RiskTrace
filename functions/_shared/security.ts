export async function secureTokenEquals(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([hash(left), hash(right)])
  let difference = leftHash.length ^ rightHash.length
  const length = Math.max(leftHash.length, rightHash.length)

  for (let index = 0; index < length; index += 1) {
    difference |= (leftHash[index] ?? 0) ^ (rightHash[index] ?? 0)
  }

  return difference === 0
}

async function hash(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(digest)
}
