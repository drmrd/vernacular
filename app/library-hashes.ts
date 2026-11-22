import type { LibraryItem } from '../storage'

/**
 * Every content hash of the listed items and of their thumbnails, or undefined when the list
 * rejects. A failed read is never an empty set, so it cannot pass for a library that holds nothing.
 */
export async function libraryHashesOf(
  list: () => Promise<readonly LibraryItem[]>,
): Promise<ReadonlySet<string> | undefined> {
  try {
    const hashes = new Set<string>()
    for (const { reference, thumbnail } of await list()) {
      hashes.add(reference.contentHash)
      if (thumbnail !== undefined) {
        hashes.add(thumbnail.contentHash)
      }
    }
    return hashes
  } catch {
    return undefined
  }
}
