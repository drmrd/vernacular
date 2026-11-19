import { newProjectId } from '../../storage'
import { callGuardedAsync } from '../guarded-call'
import type { DocumentHandle } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import type { FlowResult } from './flow-result'
import { switchProject } from './switch-project'

/** Why a folder did not open, besides the failures of a switch. */
export type FolderRefusal = { readonly kind: 'cancelled' | 'folder-empty' }

/** The folder that the user chose, with the id it opens under. */
interface ChosenFolder {
  readonly id: string
  readonly folderName: string
  /** True when this call remembered the folder under a new id. */
  readonly remembered: boolean
}

/** The name of the picked handle when it has one as a string, and '' otherwise. */
function folderNameOf(handle: { readonly name?: unknown }): string {
  return typeof handle.name === 'string' ? handle.name : ''
}

/**
 * Asks the user for a folder. A known folder keeps its id; a new folder is remembered under a new
 * id before anything opens. Undefined when the user cancels.
 */
async function chooseFolder(ports: SessionPorts): Promise<ChosenFolder | undefined> {
  const handle = await ports.folders.pick()
  if (handle === undefined) {
    return undefined
  }
  const folderName = folderNameOf(handle)
  const known = await ports.folders.findKnown(handle)
  if (known !== undefined) {
    return { id: known, folderName, remembered: false }
  }
  const id = newProjectId([])
  await ports.folders.remember(id, handle)
  return { id, folderName, remembered: true }
}

/**
 * Opens the project of a folder that the user picks. A cancelled pick calls nothing more. A folder
 * with no document gives folder-empty, and a folder that this call remembered is forgotten again;
 * a forget that fails is logged. On every other failure the folder stays remembered, so a retry
 * finds the same id. The promise never rejects.
 */
export async function openFolder(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
): Promise<FlowResult<FolderRefusal>> {
  let picked: ChosenFolder | undefined
  try {
    picked = await chooseFolder(ports)
  } catch (error) {
    return storageUnavailable(error)
  }
  if (picked === undefined) {
    return { ok: false, failure: { kind: 'cancelled' } }
  }
  const { id, folderName, remembered } = picked
  const result = await switchProject(ports, current, {
    id,
    location: { kind: 'folder', folderName },
  })
  if (result.ok || result.failure.kind !== 'not-found') {
    return result
  }
  if (remembered) {
    await callGuardedAsync(() => ports.folders.forget(id))
  }
  return { ok: false, failure: { kind: 'folder-empty' } }
}
