import { readStoredFacts, type DecodeFailure, type Project } from '../../core'
import { openDespiteFaults, PROJECT_FILE, type ProjectRecord, type StoreRead } from '../../storage'
import type { SessionPorts } from '../ports'
import { factsOf } from './project-facts'

/** The ports that rebuilding the record of one stored project needs. */
export type RebuildPorts = Pick<SessionPorts, 'workspace' | 'build'>

/** One project as the listing of the store gives it. */
export interface ListedProject {
  readonly id: string
  readonly lastChangedAt: string | undefined
}

/** The record made for one listed project, and whether the index should get it. */
export interface RebuiltRecord {
  readonly record: ProjectRecord
  /** False when the stored document could not be read, so the next call reads it again. */
  readonly putInIndex: boolean
}

/** What every record of a rebuild holds besides the facts of its document. */
interface RecordBasis {
  readonly build: string
  readonly id: string
  readonly lastChangedAt: string | undefined
  readonly lastUsedAt: string | undefined
}

/** What a read that answered gives: a document, or the failure of its decode. */
type AnsweredRead =
  | Extract<StoreRead, { readonly ok: true }>
  | { readonly ok: false; readonly decode: DecodeFailure }

/** The name and the asset hashes found in stored bytes. */
type StoredFacts = ReturnType<typeof readStoredFacts>

/** The record of a document that opened; its asset list is complete only when it passed the check. */
function recordOfProject(
  basis: RecordBasis,
  project: Project,
  passedCheck: boolean,
): ProjectRecord {
  const facts = factsOf(project)
  return {
    id: basis.id,
    location: { kind: 'workspace' },
    name: facts.name,
    floorCount: facts.floorCount,
    preview: facts.preview,
    assetHashes: facts.assetHashes,
    assetListComplete: facts.assetsListed && passedCheck,
    lastChangedAt: basis.lastChangedAt,
    lastUsedAt: basis.lastUsedAt,
    lastOpen: { opened: true, build: basis.build },
  }
}

/** The record of a project that did not open, with what could be found in its stored bytes. */
function recordOfUnopened(basis: RecordBasis, stored: StoredFacts, reason: string): ProjectRecord {
  return {
    id: basis.id,
    location: { kind: 'workspace' },
    name: stored.name,
    floorCount: undefined,
    preview: undefined,
    assetHashes: stored.assetHashes,
    assetListComplete: false,
    lastChangedAt: basis.lastChangedAt,
    lastUsedAt: basis.lastUsedAt,
    lastOpen: { opened: false, build: basis.build, reason },
  }
}

/** The name and the asset hashes of the stored document file; none when it cannot be read. */
async function storedFactsOf(ports: RebuildPorts, id: string): Promise<StoredFacts> {
  try {
    const bytes = (await ports.workspace.storedFiles(id)).get(PROJECT_FILE)
    return bytes === undefined ? { assetHashes: [] } : readStoredFacts(bytes)
  } catch {
    return { assetHashes: [] }
  }
}

/** The read of the project; undefined when it rejects or finds no document. */
async function answeredRead(ports: RebuildPorts, id: string): Promise<AnsweredRead | undefined> {
  let read: StoreRead
  try {
    read = await ports.workspace.read(id)
  } catch {
    return undefined
  }
  if (read.ok) {
    return read
  }
  return read.failure.kind === 'decode' ? { ok: false, decode: read.failure.decode } : undefined
}

/** The record of a read that answered, with the time of use that it keeps. */
async function recordOfRead(
  ports: RebuildPorts,
  listed: ListedProject,
  context: { readonly read: AnsweredRead; readonly lastUsedAt: string | undefined },
): Promise<ProjectRecord> {
  const { read } = context
  const lastChangedAt = read.ok ? read.lastChangedAt : listed.lastChangedAt
  const basis = {
    build: ports.build,
    id: listed.id,
    lastChangedAt,
    lastUsedAt: context.lastUsedAt ?? lastChangedAt,
  }
  if (read.ok) {
    return recordOfProject(basis, read.value.project, true)
  }
  // The interim rule: a document that only breaks the format rules opens anyway, so its record
  // says it opened, and its asset list is not trusted.
  if (read.decode.kind === 'format-rules') {
    return recordOfProject(basis, openDespiteFaults(read.decode), false)
  }
  return recordOfUnopened(basis, await storedFactsOf(ports, listed.id), read.decode.kind)
}

/** The record of a project whose document could not be read: no facts, and why. */
function unreadRecord(build: string, listed: ListedProject): ProjectRecord {
  const { id, lastChangedAt } = listed
  const basis = { build, id, lastChangedAt, lastUsedAt: lastChangedAt }
  return recordOfUnopened(basis, { assetHashes: [] }, 'storage-unavailable')
}

/**
 * The record of one listed project, rebuilt from its stored document. `previous` is the record that
 * the index held under its id. A read that rejects or finds no document keeps `previous`, or gives
 * a record with no facts that the index does not get, so the next call reads the project again.
 * Never rejects.
 */
export async function rebuildRecord(
  ports: RebuildPorts,
  listed: ListedProject,
  previous: ProjectRecord | undefined,
): Promise<RebuiltRecord> {
  const read = await answeredRead(ports, listed.id)
  if (read !== undefined) {
    // A folder record under the id belongs to another project, so its time of use is not taken.
    const lastUsedAt = previous?.location.kind === 'workspace' ? previous.lastUsedAt : undefined
    try {
      return { record: await recordOfRead(ports, listed, { read, lastUsedAt }), putInIndex: true }
    } catch {
      // A document too damaged to describe counts as one that could not be read.
    }
  }
  return { record: previous ?? unreadRecord(ports.build, listed), putInIndex: false }
}
