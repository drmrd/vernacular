import { renderOnAStoredProject } from './action-test-support'
import type { LibraryLister } from './pack-supplies'
import { useOpenFileAction } from './use-open-file-action'

/** Test support: what the cases of the open file action share. */

/** The toast that says an opened file is over the size limit. */
export const TOO_LARGE_SENTENCE = 'Open failed: The file is larger than 512 MB.'

/** In-memory ports with a stored project open, and the open file action on it. */
export function renderOpenFileAction(packs?: LibraryLister) {
  return renderOnAStoredProject(useOpenFileAction, packs)
}
