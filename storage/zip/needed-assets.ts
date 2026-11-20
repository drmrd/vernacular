import type { AssetReference, Project } from '../../core'
import type { LibraryItem } from '../assets/asset-source'
import { collectReferencedAssets } from '../project-files/referenced-assets'

/** Whether an installed pack supplies the asset of a `pack:` reference. */
export type PackSupplies = (reference: AssetReference) => boolean

const PACK_SCOPE_PREFIX = 'pack:'

function isPackReference(reference: AssetReference): boolean {
  return reference.scope.startsWith(PACK_SCOPE_PREFIX)
}

/**
 * The content hashes of the assets that a project needs from its archive or its pool, each once, in
 * the order of first reference. A pack reference is left out when an installed pack supplies it,
 * since the pack brings the asset itself. A hash that another reference also uses stays needed.
 */
export function neededAssetHashes(project: Project, packSupplies?: PackSupplies): string[] {
  const needed = new Set<string>()
  for (const reference of collectReferencedAssets(project)) {
    const supplied =
      isPackReference(reference) && packSupplies !== undefined && packSupplies(reference)
    // A document parsed from a file can hold a hash that is not text, and only text may be listed.
    const hash: unknown = reference.contentHash
    if (!supplied && typeof hash === 'string') {
      needed.add(hash)
    }
  }
  return [...needed]
}

/**
 * Whether a pack among the library items supplies a reference. The hash decides: the version in
 * the scope of the asked reference does not count, so a project made with an older version of an
 * installed pack still finds its assets. Only items whose own scope is a pack count.
 */
export function packSuppliesFrom(items: readonly LibraryItem[]): PackSupplies {
  const packHashes = new Set<string>()
  for (const item of items) {
    if (isPackReference(item.reference)) {
      packHashes.add(item.reference.contentHash)
    }
  }
  return (reference) => packHashes.has(reference.contentHash)
}
