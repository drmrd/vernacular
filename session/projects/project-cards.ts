import type { ProjectRecord } from '../../storage'
import { displayNameOf } from './display-name'
import type { SessionPorts } from '../ports'
import { compareUse } from './recent-records'
import { reconcileIndex } from './reconcile-index'

export type ProjectCardLocation = 'browser' | 'tab' | { readonly folderName: string }
export type ProjectCardPreview = { readonly svg: string } | 'none' | 'did-not-open'
export type ProjectCardStateLine = 'open-here' | 'open-elsewhere' | 'needs-permission'
export type ProjectCardAction = 'rename' | 'export' | 'delete' | 'remove-from-list'

/** What one card of the Projects page shows, with no text and no address in it. */
export interface ProjectCardModel {
  readonly id: string
  readonly name: string
  readonly lastChangedAt: string | undefined
  readonly floorCount: number | undefined
  readonly location: ProjectCardLocation
  readonly preview: ProjectCardPreview
  readonly stateLines: readonly ProjectCardStateLine[]
  readonly actions: readonly ProjectCardAction[]
}

/** The ids that another tab or this one holds a lock on; empty when the read fails. */
async function heldIdsOf(ports: SessionPorts): Promise<ReadonlySet<string>> {
  if (!ports.locks.supported) {
    return new Set()
  }
  try {
    return await ports.locks.heldIds()
  } catch {
    return new Set()
  }
}

/** Whether the folder of the record needs the user to grant access again; false when unknown. */
async function needsPermission(ports: SessionPorts, record: ProjectRecord): Promise<boolean> {
  if (record.location.kind !== 'folder') {
    return false
  }
  try {
    return (await ports.folders.permission(record.id)) === 'prompt'
  } catch {
    return false
  }
}

function locationOf(ports: SessionPorts, record: ProjectRecord): ProjectCardLocation {
  if (record.location.kind === 'folder') {
    return { folderName: record.location.folderName }
  }
  return ports.workspace.durable ? 'browser' : 'tab'
}

function previewOf(record: ProjectRecord): ProjectCardPreview {
  if (!record.lastOpen.opened) {
    return 'did-not-open'
  }
  return record.preview === undefined ? 'none' : { svg: record.preview }
}

function linesOf(
  id: string,
  openId: string | undefined,
  held: { readonly elsewhere: boolean; readonly permission: boolean },
): ProjectCardStateLine[] {
  const lines: ProjectCardStateLine[] = []
  if (id === openId) {
    lines.push('open-here')
  }
  if (held.elsewhere && id !== openId) {
    lines.push('open-elsewhere')
  }
  if (held.permission) {
    lines.push('needs-permission')
  }
  return lines
}

function actionsOf(record: ProjectRecord, openElsewhere: boolean): ProjectCardAction[] {
  if (openElsewhere) {
    return ['export']
  }
  const last: ProjectCardAction = record.location.kind === 'folder' ? 'remove-from-list' : 'delete'
  if (!record.lastOpen.opened) {
    return ['export', last]
  }
  return ['rename', 'export', last]
}

/** The locks held and the project open here, which decide the state lines of every card. */
interface LockState {
  readonly held: ReadonlySet<string>
  readonly openId: string | undefined
}

async function cardOf(
  ports: SessionPorts,
  record: ProjectRecord,
  locks: LockState,
): Promise<ProjectCardModel> {
  const { held, openId } = locks
  const elsewhere = held.has(record.id) && record.id !== openId
  const permission = await needsPermission(ports, record)
  return {
    id: record.id,
    name: displayNameOf(record),
    lastChangedAt: record.lastChangedAt,
    floorCount: record.floorCount,
    location: locationOf(ports, record),
    preview: previewOf(record),
    stateLines: linesOf(record.id, openId, { elsewhere, permission }),
    actions: actionsOf(record, elsewhere),
  }
}

/** One card per project of the index, latest use first. The promise never rejects. */
export async function listProjectCards(
  ports: SessionPorts,
  openId?: string,
): Promise<ProjectCardModel[]> {
  const records = await reconcileIndex(ports)
  const held = await heldIdsOf(ports)
  const ordered = [...records].sort(compareUse)
  return Promise.all(ordered.map((record) => cardOf(ports, record, { held, openId })))
}
