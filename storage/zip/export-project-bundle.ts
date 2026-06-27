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

/** Reports incremental work: `completed` of `total` units finished so far. */
export type ExportProgress = (completed: number, total: number) => void

/** Inputs for {@link exportProjectBundle}: the asset source and optional progress reporting. */
export interface ExportProjectBundleOptions {
  assets: AssetCache
  /** Called once per referenced asset as the copy loop advances, for determinate progress UI. */
  onProgress?: ExportProgress
}

/**
 * Saves the project and copies the bytes of every referenced asset into a fresh
 * .building bundle (at assets/<hash>), so the exported bundle is self-contained.
 * Assets absent from the cache are skipped (a missing-asset placeholder resolves at load).
 *
 * When `onProgress` is supplied it fires once per referenced asset, reporting the
 * running completed count against the total referenced-asset count so a caller can
 * drive a determinate progress bar for large bundles.
 */
export async function exportProjectBundle(
  projectId: string,
  project: Project,
  options: ExportProjectBundleOptions,
): Promise<Uint8Array> {
  const { assets, onProgress } = options
  const bundle = new ZipBundleProjectStore(projectId)
  await bundle.save(projectId, project)
  const bundleAssets = bundle.assetCache()
  const references = collectReferencedAssets(project)
  let completed = 0
  for (const reference of references) {
    const bytes = await assets.get(reference.contentHash)
    if (bytes !== undefined) {
      await bundleAssets.put(reference.contentHash, bytes)
    }
    completed += 1
    onProgress?.(completed, references.length)
  }
  return bundle.exportBundle()
}
