import type { Project } from '../../core'
import { copyImportedAssets, neededAssetHashes, newProjectId } from '../../storage'
import type { AssetCache, PackSupplies } from '../../storage'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import type { SwitchFailure } from './flow-result'
import { switchProject } from './switch-project'

/** A project to open as a new workspace project, with where the assets that it needs come from. */
export interface NewProjectCopy {
  readonly project: Project
  /** Whether an installed pack supplies a `pack:` reference. With none, no pack does. */
  readonly packSupplies?: PackSupplies | undefined
  /** The assets that the source holds of the needed ones. Read after the switch. */
  readonly supplied: (needed: readonly string[]) => Promise<ReadonlyMap<string, Uint8Array>>
}

/** The new project now open with the needed assets that its pool lacks, or why nothing changed. */
export type NewProjectResult =
  | {
      readonly ok: true
      readonly handle: DocumentHandle
      readonly missingAssets: readonly string[]
      /** True when the first save of the new project was stored. */
      readonly stored: boolean
    }
  | { readonly ok: false; readonly failure: SwitchFailure }

/**
 * The pool of the new project. A pool that cannot be reached does not fail the open: the copy
 * still opens, and every needed asset shows as missing.
 */
function poolOf(ports: SessionPorts, id: string): AssetCache | undefined {
  try {
    return ports.workspace.assets(id)
  } catch (error) {
    console.error('The asset pool of the new project cannot be reached; no asset is copied.', error)
    return undefined
  }
}

/**
 * Opens the project as a new workspace project. The switch flushes and closes the current project;
 * then the needed assets that the source holds go into the pool, and the copy is saved at once, so
 * the pool has the assets before the stored document refers to them. Nothing is written before the
 * switch. The result holds the handle whatever that save's outcome; a failed save shows in the save
 * status.
 */
export async function openAsNewProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  copy: NewProjectCopy,
): Promise<NewProjectResult> {
  const { project } = copy
  const id = newProjectId([])
  const switched = await switchProject(ports, current, {
    id,
    location: { kind: 'workspace' },
    create: () => project,
  })
  if (!switched.ok) {
    return switched
  }
  const needed = neededAssetHashes(project, copy.packSupplies)
  const assets = await copy.supplied(needed)
  const pool = poolOf(ports, id)
  const missingAssets = pool === undefined ? needed : await copyImportedAssets(pool, assets, needed)
  const saved = await switched.handle.save()
  return { ok: true, handle: switched.handle, missingAssets, stored: saved.ok }
}
