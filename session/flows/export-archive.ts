import { bundleFilename, exportProjectBundle } from '../../storage'
import type { PackSupplies } from '../../storage'
import { assetsOf } from '../handle/handle-assets'
import type { DocumentHandle } from '../handle/handle-types'
import { messageOf } from '../handle/thrown-failures'

/**
 * How an export reports its progress, and which packs the reader of the file has. An asset that
 * such a pack supplies is neither carried in the archive nor reported.
 */
export interface ExportArchiveOptions {
  /**
   * Called once for each needed hash, with the count done and the total. A hash that the project
   * names twice counts once, and an asset that an accepted pack supplies does not count.
   */
  readonly onProgress?: (completed: number, total: number) => void
  /** Tells which `pack:` references an installed pack supplies; those are left out of the archive. */
  readonly packSupplies?: PackSupplies
}

/**
 * The bytes of the archive, its file name, and the hashes of the assets it could not include, or
 * why no archive was made.
 */
export type ExportArchiveResult =
  | {
      readonly ok: true
      readonly bytes: Uint8Array
      readonly fileName: string
      readonly missingAssets: readonly string[]
    }
  | { readonly ok: false; readonly message: string }

/**
 * Packs the open project and the assets it refers to into a `.building` archive. It flushes first,
 * so a pending change is stored before the archive exists, and it exports also when that flush
 * fails: the save status shows the failed save. The project is read after the flush ended. The
 * promise never rejects; a thrown value, also for an object that no open built, gives a message.
 */
export async function exportArchive(
  handle: DocumentHandle,
  options: ExportArchiveOptions = {},
): Promise<ExportArchiveResult> {
  try {
    const assets = assetsOf(handle)
    await handle.flush()
    const project = handle.session.getProject()
    const { bytes, missingAssets } = await exportProjectBundle(handle.id, project, {
      assets,
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.packSupplies === undefined ? {} : { packSupplies: options.packSupplies }),
    })
    return { ok: true, bytes, fileName: bundleFilename(project.meta.name), missingAssets }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}
