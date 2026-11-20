import {
  hasSwitchedToMemory,
  readLegacyActiveProjectId,
  removeLegacyActiveProjectId,
  type FolderAccess,
  type ProjectRecord,
} from '../../storage'
import { callGuardedAsync } from '../guarded-call'
import type { SessionPorts } from '../ports'

/** The id under which the older build remembered the folder of today's project. */
const LEGACY_FOLDER_ID = 'current'

/**
 * What a rebuild carries over from the older build: the folder that it remembered, which is
 * forgotten, and the id of the last active project, which becomes the latest use in the index.
 * The remembered id is removed only once its marked record landed in the durable index.
 */
export interface ProjectUpgrade {
  /** The forget of the remembered folder. Never rejects. */
  readonly folderStep: Promise<void>
  /** Learns what the read of the index gave; undefined when that read rejected. */
  noteIndexRead(records: readonly ProjectRecord[] | undefined): void
  /** Learns the ids that the store lists, and drops a remembered id that the store does not hold. */
  noteListing(listedIds: ReadonlySet<string>): void
  /** The record to put, with the mark when it is due. Call it in the same turn as its put. */
  recordToPut(record: ProjectRecord): ProjectRecord
  /** Learns whether the put of a record resolved; the landing of the mark removes the old id. */
  notePut(record: ProjectRecord, landed: boolean): void
}

/**
 * Forgets the folder that the older build remembered, without reopening it, so the browser asks
 * nothing and no file of the folder is touched. A failure is logged and tried again next time.
 */
async function forgetLegacyFolder(folders: FolderAccess): Promise<void> {
  let answer: Awaited<ReturnType<FolderAccess['permission']>>
  try {
    answer = await folders.permission(LEGACY_FOLDER_ID)
  } catch (error) {
    console.error(error)
    return
  }
  if (answer !== 'missing') {
    await callGuardedAsync(() => folders.forget(LEGACY_FOLDER_ID))
  }
}

/** The folder step of a durable workspace whose host has folders; nothing otherwise. */
function folderStepOf(ports: SessionPorts): Promise<void> {
  return ports.workspace.durable && ports.folders.supported
    ? forgetLegacyFolder(ports.folders)
    : Promise.resolve()
}

/** True when the index answered and holds no workspace record under the remembered id. */
function markIsOpen(id: string, records: readonly ProjectRecord[] | undefined): boolean {
  return (
    records !== undefined &&
    !records.some((record) => record.id === id && record.location.kind === 'workspace')
  )
}

/**
 * Starts the upgrade of one run. The remembered id is read here, before the run reads the index,
 * so a tab that finds no id reads the index after another tab's mark landed.
 */
export function startUpgrade(ports: SessionPorts): ProjectUpgrade {
  const folderStep = folderStepOf(ports)
  const rememberedId = ports.workspace.durable ? readLegacyActiveProjectId() : undefined
  let markDue = false
  let marked: ProjectRecord | undefined
  return {
    folderStep,
    noteIndexRead(records) {
      markDue = rememberedId !== undefined && markIsOpen(rememberedId, records)
    },
    noteListing(listedIds) {
      const unheld = rememberedId !== undefined && !listedIds.has(rememberedId)
      if (unheld && !hasSwitchedToMemory(ports.index)) {
        removeLegacyActiveProjectId()
      }
    },
    recordToPut(record) {
      if (!markDue || record.id !== rememberedId || hasSwitchedToMemory(ports.index)) {
        return record
      }
      marked = { ...record, lastUsedAt: ports.now().toISOString() }
      return marked
    },
    notePut(record, landed) {
      if (landed && record === marked) {
        removeLegacyActiveProjectId()
      }
    },
  }
}
