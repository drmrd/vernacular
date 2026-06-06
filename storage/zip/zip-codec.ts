import { zipSync, unzipSync, type Zippable } from 'fflate'

/** Logical folder contents keyed by forward-slash path (the DirectoryPort shape). */
export type FolderEntries = Map<string, Uint8Array>

/** Pack folder entries into .house.zip bytes. */
export function zipFolder(entries: FolderEntries): Uint8Array {
  const zippable: Zippable = {}
  for (const [path, bytes] of entries) {
    zippable[path] = bytes
  }
  return zipSync(zippable)
}

/** Unpack .house.zip bytes back into folder entries. Throws on malformed input. */
export function unzipFolder(bytes: Uint8Array): FolderEntries {
  // unzipSync throws on bytes that are not a valid zip archive.
  const unzipped = unzipSync(bytes)
  const entries: FolderEntries = new Map()
  for (const [path, content] of Object.entries(unzipped)) {
    entries.set(path, content)
  }
  return entries
}
