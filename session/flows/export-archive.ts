import { bundleFilename, exportProjectBundle } from '../../storage'
import { internalsOf } from '../handle/handle-internals'
import type { DocumentHandle } from '../handle/handle-types'
import { messageOf } from '../handle/thrown-failures'

/** How an export reports its progress. */
export interface ExportArchiveOptions {
  /** Called once for each referenced asset, with the count done and the total. */
  readonly onProgress?: (completed: number, total: number) => void
}

/** The bytes of the archive and its file name, or why no archive was made. */
export type ExportArchiveResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly fileName: string }
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
    const { store } = internalsOf(handle)
    await handle.flush()
    const project = handle.session.getProject()
    const assets = store.assets(handle.id)
    const bytes = await exportProjectBundle(handle.id, project, {
      assets,
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    })
    return { ok: true, bytes, fileName: bundleFilename(project.meta.name) }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}
