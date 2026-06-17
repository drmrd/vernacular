import type { AssetReference, Project, UnderlaySource } from '../../core'
import type { AssetCache } from '../asset-cache'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

function underlayAssetRef(source: UnderlaySource): AssetReference {
  if (source.kind === 'raster') {
    return source.image
  }
  if (source.kind === 'document') {
    return source.document
  }
  return source.scene
}

/** Every AssetReference the document references: placed furniture and underlay sources. */
export function collectReferencedAssets(project: Project): AssetReference[] {
  const references: AssetReference[] = []
  for (const floor of project.floors) {
    for (const item of floor.furniture) {
      references.push(item.assetRef)
    }
    for (const underlay of floor.underlays) {
      references.push(underlayAssetRef(underlay.source))
    }
  }
  return references
}

/**
 * Saves the project and copies the bytes of every referenced asset into a fresh
 * .building bundle (at assets/<hash>), so the exported bundle is self-contained.
 * Assets absent from `assets` are skipped (a missing-asset placeholder resolves at load).
 */
export async function exportProjectBundle(
  projectId: string,
  project: Project,
  assets: AssetCache,
): Promise<Uint8Array> {
  const bundle = new ZipBundleProjectStore(projectId)
  await bundle.save(projectId, project)
  const bundleAssets = bundle.assetCache()
  for (const reference of collectReferencedAssets(project)) {
    const bytes = await assets.get(reference.contentHash)
    if (bytes !== undefined) {
      await bundleAssets.put(reference.contentHash, bytes)
    }
  }
  return bundle.exportBundle()
}
