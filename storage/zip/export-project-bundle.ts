import type { Project } from '../../core'
import type { AssetCache } from '../asset-cache'
import { isContentHash } from './archive-layout'
import { neededAssetHashes } from './needed-assets'
import type { PackSupplies } from './needed-assets'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

/** Reports incremental work: `completed` of `total` units finished so far. */
export type ExportProgress = (completed: number, total: number) => void

/**
 * Inputs for {@link exportProjectBundle}: the asset source, optional progress reporting, and
 * optionally which packs the reader of the file has.
 */
export interface ExportProjectBundleOptions {
  assets: AssetCache
  /** Called once per needed asset as the copy loop advances, for determinate progress UI. */
  onProgress?: ExportProgress
  /** Tells which `pack:` references an installed pack supplies; those are left out of the bundle. */
  packSupplies?: PackSupplies
}

/** The bytes of a .building bundle and the hashes of the assets it could not include. */
export interface ExportedBundle {
  readonly bytes: Uint8Array
  /** Hashes whose bytes were not in the pool (or that are not content hashes), in order of first reference. */
  readonly missingAssets: readonly string[]
}

/**
 * Saves the project and copies the bytes of every needed asset into a fresh .building bundle (at
 * assets/<hash>). An asset that an installed pack supplies is left out. The bundle is always made:
 * an asset that the cache lacks, or a reference that is not a content hash, is listed in
 * `missingAssets` instead of failing the export.
 *
 * When `onProgress` is supplied it fires once per needed asset, carried or missing, reporting the
 * running completed count against the total so a caller can drive a determinate progress bar.
 */
export async function exportProjectBundle(
  projectId: string,
  project: Project,
  options: ExportProjectBundleOptions,
): Promise<ExportedBundle> {
  const { assets, onProgress, packSupplies } = options
  const bundle = new ZipBundleProjectStore(projectId)
  await bundle.save(projectId, project)
  const bundleAssets = bundle.assetCache()
  const hashes = neededAssetHashes(project, packSupplies)
  const missingAssets: string[] = []
  let completed = 0
  for (const hash of hashes) {
    const bytes = isContentHash(hash) ? await assets.get(hash) : undefined
    if (bytes === undefined) {
      missingAssets.push(hash)
    } else {
      await bundleAssets.put(hash, bytes)
    }
    completed += 1
    onProgress?.(completed, hashes.length)
  }
  return { bytes: await bundle.exportBundle(), missingAssets }
}
