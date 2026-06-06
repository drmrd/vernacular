import { zipSync, unzipSync, type Zippable } from 'fflate'

/** Logical folder contents keyed by forward-slash path (the DirectoryPort shape). */
export type FolderEntries = Map<string, Uint8Array>

/**
 * The byte-array constructor that `TextEncoder` (the DirectoryPort's text source)
 * produces. In a real browser this is the global `Uint8Array`; jsdom binds its
 * `TextEncoder` output to a separate realm, so we reconstruct entries through the
 * matching constructor to keep byte values interchangeable with caller-supplied bytes.
 */
const ByteArray = new TextEncoder().encode('').constructor as Uint8ArrayConstructor

/** Pack folder entries into .house.zip bytes. */
export function zipFolder(entries: FolderEntries): Uint8Array {
  // fflate's Zippable maps each path to its bytes; '/'-separated keys become nested
  // entries. fflate decides a value is a file by `instanceof Uint8Array` against the
  // realm it captured, so copy each value into that realm to keep paths flat.
  const zippable: Zippable = {}
  for (const [path, bytes] of entries) {
    zippable[path] = new Uint8Array(bytes)
  }
  return zipSync(zippable)
}

/** Unpack .house.zip bytes back into folder entries. Throws on malformed input. */
export function unzipFolder(bytes: Uint8Array): FolderEntries {
  // unzipSync throws on bytes that are not a valid zip archive.
  const unzipped = unzipSync(bytes)
  const entries: FolderEntries = new Map()
  for (const [path, content] of Object.entries(unzipped)) {
    entries.set(path, new ByteArray(content))
  }
  return entries
}
