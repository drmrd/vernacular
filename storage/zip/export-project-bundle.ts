import type { Project } from '../../core'
import type { AssetCache } from '../asset-cache'
import { collectReferencedAssets } from '../project-files/referenced-assets'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

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
