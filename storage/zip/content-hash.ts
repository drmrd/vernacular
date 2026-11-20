const HEXADECIMAL_RADIX = 16
const DIGITS_PER_BYTE = 2

/**
 * The SHA-256 of the bytes as lower-case hexadecimal digits, the form of every content hash. The
 * view itself is handed to the digest: a stored asset is a view into the archive, and its buffer
 * holds the rest of the archive too, so hashing the buffer would hash the wrong bytes. Nothing is
 * copied here.
 *
 * The digest takes only a view over an `ArrayBuffer`, and the type of `Uint8Array` also allows a
 * shared buffer. The type is narrowed here without a copy, on the condition that the caller holds
 * a view over an `ArrayBuffer`. A view over a shared buffer makes the digest fail, and the caller
 * decides what a failure means.
 */
export async function contentHashOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(HEXADECIMAL_RADIX).padStart(DIGITS_PER_BYTE, '0'),
  ).join('')
}
