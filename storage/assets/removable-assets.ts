import { isContentHash } from '../zip/archive-layout'

export interface AssetUser {
  readonly id: string
  readonly assetHashes: readonly string[]
  readonly assetListComplete: boolean
}

/**
 * Decides which assets a deleted project may take with it. An asset is removable when only the
 * deleted project lists it: no other project lists it and the user library does not hold it.
 * If any other project has an incomplete asset list, nothing is removable, because that project
 * might use any asset.
 */
export function removableAssets(
  deleted: string,
  users: readonly AssetUser[],
  library: ReadonlySet<string>,
): string[] {
  const others = users.filter((user) => user.id !== deleted)
  if (others.some((user) => !user.assetListComplete)) {
    return []
  }
  const stillUsed = new Set(others.flatMap((user) => user.assetHashes))
  const candidates = new Set(
    users.filter((user) => user.id === deleted).flatMap((user) => user.assetHashes),
  )
  return [...candidates].filter(
    (hash) => isContentHash(hash) && !stillUsed.has(hash) && !library.has(hash),
  )
}
