/** A content hash is the SHA-256 of the bytes, written as this many lower-case hexadecimal digits. */
const CONTENT_HASH_DIGITS = 64

/** Anchored and ASCII only, with no flag: no change of case and no other form of a digit matches. */
const CONTENT_HASH_PATTERN = new RegExp(`^[0-9a-f]{${String(CONTENT_HASH_DIGITS)}}$`)

const ASSET_ENTRY_PREFIX = 'assets/'

/** The name of the archive entry that holds the project document. */
export const DOCUMENT_ENTRY_NAME = 'vernacular.json'

/** Accepts exactly 64 lower-case hexadecimal ASCII digits, and nothing else. */
export function isContentHash(value: string): boolean {
  return CONTENT_HASH_PATTERN.test(value)
}

/** LY2: the name of the archive entry that holds the asset with this content hash. */
export function assetEntryName(contentHash: string): string {
  return `${ASSET_ENTRY_PREFIX}${contentHash}`
}

/**
 * LY2: the content hash of an asset entry, or `undefined` for every name outside the layout. The
 * name is compared as it is: no change of case, no trim, no normalization, no joining of segments.
 */
export function assetHashOfEntry(name: string): string | undefined {
  if (!name.startsWith(ASSET_ENTRY_PREFIX)) return undefined
  const contentHash = name.slice(ASSET_ENTRY_PREFIX.length)
  return isContentHash(contentHash) ? contentHash : undefined
}
