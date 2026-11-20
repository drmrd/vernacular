import type { AssetCache } from '../asset-cache'
import { DOCUMENT_ENTRY_NAME, assetEntryName, isContentHash } from './archive-layout'
import { zipFolder } from './zip-codec'
import type { FolderEntries } from './zip-codec'

const SIDECAR_PREFIXES = ['.house-autosave/', '.house-backups/']

/** The bytes of a .building archive and how many asset entries it holds. */
export interface UncheckedCopy {
  readonly bytes: Uint8Array
  readonly includedAssets: number
}

function isCopiedPath(path: string): boolean {
  return path === DOCUMENT_ENTRY_NAME || SIDECAR_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/** The bytes of an asset, or `undefined` when the pool lacks it or the read fails. */
async function readAssetBytes(assets: AssetCache, hash: string): Promise<Uint8Array | undefined> {
  try {
    return await assets.get(hash)
  } catch {
    return undefined
  }
}

/**
 * Builds a .building archive from the raw files of a project folder without opening the project.
 * The document bytes are copied as they are (they are not decoded or checked), together with the
 * snapshots and backups, and the bytes of each listed asset that the pool can supply. A value
 * that is not a content hash, an asset the pool lacks, and a pool read that fails are all left
 * out, so the copy is made for a project that did not open.
 */
export async function buildUncheckedCopy(
  files: ReadonlyMap<string, Uint8Array>,
  assets: AssetCache,
  assetHashes: readonly string[],
): Promise<UncheckedCopy> {
  const entries: FolderEntries = new Map()
  for (const [path, bytes] of files) {
    if (isCopiedPath(path)) entries.set(path, bytes)
  }
  let includedAssets = 0
  for (const hash of new Set(assetHashes)) {
    if (!isContentHash(hash)) continue
    const bytes = await readAssetBytes(assets, hash)
    if (bytes === undefined) continue
    entries.set(assetEntryName(hash), bytes)
    includedAssets += 1
  }
  return { bytes: zipFolder(entries), includedAssets }
}
