import type { Project } from '../../core'
import type { ProjectRecord, ProjectSummary } from '../../storage'
import { findInternals } from '../handle/handle-internals'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { assetHashesOf } from '../projects/project-facts'
import { type StorageUnavailable, storageFailureOf } from './card-flow-failures'

/**
 * The pool assets that each project of the workspace uses, by id. A project whose asset list is not
 * known maps to undefined.
 */
export type AssetUsers = ReadonlyMap<string, readonly string[] | undefined>

export type UsersResult =
  | { readonly ok: true; readonly users: AssetUsers }
  | { readonly ok: false; readonly failure: StorageUnavailable }

/**
 * The asset list of a record that is complete and as new as the stored document; else unknown. A
 * workspace project with a second file is unknown: its record lists the assets of one document.
 */
function listedBy(
  record: ProjectRecord | undefined,
  listed: ProjectSummary,
): readonly string[] | undefined {
  const current =
    record?.assetListComplete === true &&
    !(record.secondFile !== undefined && record.location.kind === 'workspace') &&
    listed.lastChangedAt !== undefined &&
    record.lastChangedAt === listed.lastChangedAt
  return current ? record.assetHashes : undefined
}

function liveHashesOf(current: DocumentHandle): readonly string[] | undefined {
  const besideSecondFile = findInternals(current)?.records.secondFileState() !== undefined
  if (besideSecondFile && current.location.kind === 'workspace') {
    return undefined
  }
  const project: Project = current.session.getProject()
  return assetHashesOf(project)
}

/**
 * Every project that the workspace lists, with the assets it uses. The open project counts by its
 * live document, also when the store does not hold it yet. Rejects only when a read rejects.
 */
async function readUsers(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
): Promise<AssetUsers> {
  const listed = await ports.workspace.list()
  const records = new Map((await ports.index.all()).map((record) => [record.id, record]))
  const users = new Map<string, readonly string[] | undefined>()
  for (const summary of listed) {
    users.set(summary.id, listedBy(records.get(summary.id), summary))
  }
  if (current !== undefined) {
    users.set(current.id, liveHashesOf(current))
  }
  return users
}

/** The users of the pool, or why they could not be read. Never rejects. */
export async function usersOf(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
): Promise<UsersResult> {
  try {
    return { ok: true, users: await readUsers(ports, current) }
  } catch (error) {
    return { ok: false, failure: storageFailureOf(error) }
  }
}

/**
 * The assets that only the project of the id used. Nothing is removable when the library is not
 * known, when the project is unknown, or when any project's asset list is not known.
 */
export function removableAssets(
  id: string,
  users: AssetUsers,
  libraryHashes: ReadonlySet<string> | undefined,
): string[] {
  const own = users.get(id)
  if (libraryHashes === undefined || own === undefined) {
    return []
  }
  const kept = new Set(libraryHashes)
  for (const [otherId, hashes] of users) {
    if (hashes === undefined) {
      return []
    }
    if (otherId !== id) {
      hashes.forEach((hash) => kept.add(hash))
    }
  }
  return own.filter((hash) => !kept.has(hash))
}
