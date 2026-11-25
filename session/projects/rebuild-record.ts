import { readStoredFacts, type DecodeFailure } from '../../core'
import { PROJECT_FILE, type ProjectRecord, type StoreRead } from '../../storage'
import type { SessionPorts } from '../ports'
import { recordOfOpened, type OpenedRecordBasis } from './project-facts'

/** The ports that rebuilding the record of one stored project needs. */
export type RebuildPorts = Pick<SessionPorts, 'workspace' | 'build'>

/** The calls of a port that rejected or threw during one run of the rebuild. */
export interface FailedSteps {
  /** Notes one failed call with its error. */
  note(error: unknown): void
}

/** What rebuilding the record of one stored project works with. */
export interface RebuildRun {
  readonly ports: RebuildPorts
  readonly failed: FailedSteps
}

/** One project as the listing of the store gives it. */
export interface ListedProject {
  readonly id: string
  readonly lastChangedAt: string | undefined
}

/** The record made for one listed project, and whether the index should get it. */
export interface RebuiltRecord {
  readonly record: ProjectRecord
  /** False when the stored project could not be read in full, so the next call reads it again. */
  readonly putInIndex: boolean
}

/** Every record of a rebuild is of a project in the workspace. */
const IN_WORKSPACE = { kind: 'workspace' } as const

/** What every record of a rebuild holds besides the facts of its document. */
type RecordBasis = Omit<OpenedRecordBasis, 'passedCheck'>

/** What a read that answered gives: a document, or the failure of its decode. */
type AnsweredRead =
  | Extract<StoreRead, { readonly ok: true }>
  | { readonly ok: false; readonly decode: DecodeFailure }

/** The name and the asset hashes found in stored bytes. */
type StoredFacts = ReturnType<typeof readStoredFacts>

/** The record of a project that did not open, with what could be found in its stored bytes. */
function recordOfUnopened(basis: RecordBasis, stored: StoredFacts, reason: string): ProjectRecord {
  return {
    id: basis.id,
    location: basis.location,
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

/**
 * The name and the asset hashes of the stored document file; undefined when they cannot be read.
 */
async function storedFactsOf(run: RebuildRun, id: string): Promise<StoredFacts | undefined> {
  try {
    const bytes = (await run.ports.workspace.storedFiles(id)).get(PROJECT_FILE)
    return bytes === undefined ? { assetHashes: [] } : readStoredFacts(bytes)
  } catch (error) {
    run.failed.note(error)
    return undefined
  }
}

/** The read of the project; undefined when it rejects or finds no document. */
async function answeredRead(run: RebuildRun, id: string): Promise<AnsweredRead | undefined> {
  let read: StoreRead
  try {
    read = await run.ports.workspace.read(id)
  } catch (error) {
    run.failed.note(error)
    return undefined
  }
  if (read.ok) {
    return read
  }
  return read.failure.kind === 'decode' ? { ok: false, decode: read.failure.decode } : undefined
}

/**
 * The record of a project that did not open, with the facts of its stored bytes. When those bytes
 * cannot be read the record has no name, and the index does not get it, so a name is not lost.
 */
async function unopenedFromStore(
  run: RebuildRun,
  basis: RecordBasis,
  reason: string,
): Promise<RebuiltRecord> {
  const stored = await storedFactsOf(run, basis.id)
  const record = recordOfUnopened(basis, stored ?? { assetHashes: [] }, reason)
  return { record, putInIndex: stored !== undefined }
}

/** The record of a read that answered, with the time of use that it keeps. */
async function recordOfRead(
  run: RebuildRun,
  listed: ListedProject,
  context: { readonly read: AnsweredRead; readonly lastUsedAt: string | undefined },
): Promise<RebuiltRecord> {
  const { read } = context
  const lastChangedAt = read.ok ? read.lastChangedAt : listed.lastChangedAt
  const basis = {
    build: run.ports.build,
    id: listed.id,
    location: IN_WORKSPACE,
    lastChangedAt,
    lastUsedAt: context.lastUsedAt ?? lastChangedAt,
  }
  if (read.ok) {
    return {
      record: recordOfOpened(read.value.project, { ...basis, passedCheck: true }),
      putInIndex: true,
    }
  }
  return unopenedFromStore(run, basis, read.decode.kind)
}

/** The record of a project whose document could not be read: no facts, and why. */
function unreadRecord(build: string, listed: ListedProject): ProjectRecord {
  const { id, lastChangedAt } = listed
  const basis = { build, id, location: IN_WORKSPACE, lastChangedAt, lastUsedAt: lastChangedAt }
  return recordOfUnopened(basis, { assetHashes: [] }, 'storage-unavailable')
}

/**
 * The record of one listed project, rebuilt from its stored document. `previous` is the record that
 * the index held under its id. A read that rejects or finds no document keeps a previous workspace
 * record, or gives a record with no facts that the index does not get, so the next call reads the
 * project again. A folder record under the id belongs to another project and gives nothing. Never
 * rejects.
 */
export async function rebuildRecord(
  run: RebuildRun,
  listed: ListedProject,
  previous: ProjectRecord | undefined,
): Promise<RebuiltRecord> {
  const earlier = previous?.location.kind === 'workspace' ? previous : undefined
  const read = await answeredRead(run, listed.id)
  if (read !== undefined) {
    try {
      return await recordOfRead(run, listed, { read, lastUsedAt: earlier?.lastUsedAt })
    } catch {
      // A sound document whose record cannot be made counts as one that could not be read. No port
      // failed here, so this counts as no failed step.
    }
  }
  return { record: earlier ?? unreadRecord(run.ports.build, listed), putInIndex: false }
}
