// core/assets/sha256-hex.ts
//
// The one definition of a sha256 hex digest: 64 lower-case hex characters.

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value)
}
