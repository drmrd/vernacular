import type {
  DocumentFileFacts,
  DocumentStore,
  ProjectLockHold,
  ProjectRecord,
  SecondFileChange,
  SecondFileRefusal,
  TwoDocumentFiles,
} from '../../storage'
import { findDocumentStore } from '../handle/find-document-store'
import type { DocumentHandle, OpenFailed, OpenRequest } from '../handle/handle-types'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import type { SwitchFailure } from './flow-result'
import { assetsOfFolder, openAsNewProject } from './new-project-copy'
import { recentTarget, recordOf } from './open-recent'
import { freeLock, lockFor } from './project-lock-for'
import { switchProject } from './switch-project'

/** The two files of a project as the dialog shows them, or why they cannot be read. */
export type TwoFilesRead =
  | { readonly ok: true; readonly files: TwoDocumentFiles | undefined }
  | { readonly ok: false; readonly failure: SwitchFailure }

export interface KeptFileChoice {
  readonly id: string
  /** The two files as the dialog showed them. */
  readonly files: TwoDocumentFiles
  /** True when the dialog showed before an open: a choice that succeeds opens the project. */
  readonly open?: boolean
}

export type KeptFileRefusal = Exclude<SecondFileRefusal, { readonly kind: 'no-second-file' }>

/** `handle` is the handle that this tab has open after the flow; undefined when it has none. */
export type KeptFileResult =
  | { readonly ok: true; readonly handle: DocumentHandle | undefined }
  | {
      readonly ok: false
      readonly failure: SwitchFailure | KeptFileRefusal
      readonly handle: DocumentHandle | undefined
    }

export type SecondFileAsNewResult =
  | {
      readonly ok: true
      readonly handle: DocumentHandle
      readonly missingAssets: readonly string[]
      /** False in temporary storage, or when the new project's first save was not stored. */
      readonly secondFileMoved: boolean
    }
  | Extract<KeptFileResult, { readonly ok: false }>

type Stopped = Extract<KeptFileResult, { readonly ok: false }>

type Failed = { readonly ok: false; readonly failure: SwitchFailure | KeptFileRefusal }

type Outcome = { readonly ok: true } | Failed

const CHOSEN: Outcome = { ok: true }

const FILES_CHANGED: Failed = { ok: false, failure: { kind: 'files-changed' } }

const SECOND_FILE_COPY_SUFFIX = ' (second plan file)'

/** The name of a project made from a second file: "<name> (second plan file)". */
export function secondFileCopyName(name: string): string {
  return `${name}${SECOND_FILE_COPY_SUFFIX}`
}

/** Where a project is kept: its store and the request that opens it. */
interface Located {
  readonly ok: true
  readonly store: DocumentStore
  readonly request: OpenRequest
}

async function storeAt(ports: SessionPorts, request: OpenRequest): Promise<Located | OpenFailed> {
  const found = await findDocumentStore(ports, request)
  return found.ok ? { ok: true, store: found.store, request } : found
}

async function locateOrReject(ports: SessionPorts, id: string): Promise<Located | OpenFailed> {
  const target = await recentTarget(ports, id)
  return target.ok ? storeAt(ports, target.request) : target
}

/** The project's store and request, found as the recent list finds them. Never rejects. */
function locate(ports: SessionPorts, id: string): Promise<Located | OpenFailed> {
  return locateOrReject(ports, id).catch(storageUnavailable)
}

async function twoFilesOf(store: DocumentStore, id: string): Promise<TwoFilesRead> {
  const files = await store.twoFiles(id)
  const known = files !== undefined || (await store.list()).some((summary) => summary.id === id)
  return known ? { ok: true, files } : { ok: false, failure: { kind: 'not-found' } }
}

/**
 * Reads the two document files of the project of the id: undefined `files` when it has no second
 * file at or below the build's version. Takes no lock and writes nothing. Never rejects.
 */
export async function readTwoFiles(ports: SessionPorts, id: string): Promise<TwoFilesRead> {
  try {
    const located = await locate(ports, id)
    return located.ok ? await twoFilesOf(located.store, id) : located
  } catch (error) {
    return storageUnavailable(error)
  }
}

/** The lock of the project, taken for a choice, with what the end of the flow needs. */
interface Held extends Located {
  readonly hold: ProjectLockHold
  /** True when this tab held the project open: its handle ended through the hand-over. */
  readonly wasOpen: boolean
  /** The handle of another project that stays open until the project opens. */
  readonly other: DocumentHandle | undefined
  /** True when a choice that succeeds opens the project. */
  readonly openAfter: boolean
}

async function lockLocated(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  located: Located & { readonly openAfter: boolean },
): Promise<Held | Stopped> {
  const locked = await lockFor(ports, current, located.request.id)
  if (!locked.ok) {
    return { ok: false, failure: locked.failure, handle: current }
  }
  const other = locked.currentClosed ? undefined : current
  return { ...located, hold: locked.hold, wasOpen: locked.currentClosed, other }
}

async function takeLock(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
): Promise<Held | Stopped> {
  const located = await locate(ports, choice.id)
  return located.ok
    ? lockLocated(ports, current, { ...located, openAfter: choice.open === true })
    : { ...located, handle: current }
}

/** Runs the work holding the lock, which is freed in every outcome. A throw is a failure. */
async function underLock<Done extends { readonly ok: true }>(
  held: Held,
  work: () => Promise<Done | Failed>,
): Promise<Done | Failed> {
  try {
    return await work()
  } catch (error) {
    return storageUnavailable(error)
  } finally {
    await freeLock(held.hold)
  }
}

/** A refusal: the project opens again when this tab held it. */
async function finishRefused(ports: SessionPorts, held: Held, failed: Failed): Promise<Stopped> {
  const opened = held.wasOpen ? await switchProject(ports, held.other, held.request) : undefined
  return { ...failed, handle: opened?.ok ? opened.handle : held.other }
}

/**
 * Opens the project again when this tab held it, and also when the dialog showed before an open.
 * The handle of another project stays open meanwhile.
 */
async function finish(ports: SessionPorts, held: Held, outcome: Outcome): Promise<KeptFileResult> {
  if (!outcome.ok) {
    return finishRefused(ports, held, outcome)
  }
  if (!held.wasOpen && !held.openAfter) {
    return { ok: true, handle: held.other }
  }
  const opened = await switchProject(ports, held.other, held.request)
  return opened.ok ? { ok: true, handle: opened.handle } : { ...opened, handle: held.other }
}

function sameFile(left: DocumentFileFacts, right: DocumentFileFacts): boolean {
  return left.name === right.name && left.digest === right.digest
}

function sameFiles(now: TwoDocumentFiles | undefined, shown: TwoDocumentFiles): boolean {
  return (
    now !== undefined &&
    now.state === shown.state &&
    sameFile(now.main, shown.main) &&
    sameFile(now.second, shown.second)
  )
}

function refusalOf(refusal: SecondFileRefusal): Failed {
  return refusal.kind === 'no-second-file' ? FILES_CHANGED : { ok: false, failure: refusal }
}

function withoutSecondFile(record: ProjectRecord): ProjectRecord {
  const withoutIt: { -readonly [Field in keyof ProjectRecord]: ProjectRecord[Field] } = {
    ...record,
  }
  delete withoutIt.secondFile
  return withoutIt
}

/** Removes the second file from the record of the project, as the index keeps it. */
async function clearSecondFileOfRecord(ports: SessionPorts, id: string): Promise<void> {
  const record = await recordOf(ports, id)
  if (record?.secondFile !== undefined) {
    await ports.index.put(withoutSecondFile(record))
  }
}

async function unchanged(store: DocumentStore, choice: KeptFileChoice): Promise<boolean> {
  return sameFiles(await store.twoFiles(choice.id), choice.files)
}

/** A choice and the change of the stored files that answers it. */
interface ChosenChange {
  readonly choice: KeptFileChoice
  readonly change: (store: DocumentStore) => Promise<SecondFileChange>
}

/** Changes the stored files under the project's lock when they are as the choice saw them. */
async function chooseUnderLock(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  { choice, change }: ChosenChange,
): Promise<KeptFileResult> {
  const held = await takeLock(ports, current, choice)
  if (!held.ok) {
    return held
  }
  const outcome = await underLock<{ readonly ok: true }>(held, async () => {
    if (!(await unchanged(held.store, choice))) {
      return FILES_CHANGED
    }
    const changed = await change(held.store)
    if (!changed.ok) {
      return refusalOf(changed.refusal)
    }
    await clearSecondFileOfRecord(ports, choice.id)
    return CHOSEN
  })
  return finish(ports, held, outcome)
}

/**
 * Makes the main file hold the second file's document and sets the second files aside, then opens
 * the project when the choice asks for it or this tab held it. A changed file writes nothing.
 * Never rejects.
 */
export function replaceWithSecondFile(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
): Promise<KeptFileResult> {
  return chooseUnderLock(ports, current, {
    choice,
    change: (store) => store.promoteSecondFile(choice.id, choice.files),
  })
}

/**
 * Sets the second files aside and keeps the main file. Only a choice made with both files readable
 * can be answered so. Never rejects.
 */
export function removeSecondFile(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
): Promise<KeptFileResult> {
  return chooseUnderLock(ports, current, {
    choice,
    change: async (store) =>
      choice.files.state === 'both-readable'
        ? store.setAsideSecondFile(choice.id, choice.files)
        : { ok: false, refusal: { kind: 'files-changed' } },
  })
}

/**
 * Sets the second files aside after the new project was stored in durable storage. A move that
 * fails leaves the files and the record as they are: the new project is already open.
 */
async function setAsideAfterCopy(
  ports: SessionPorts,
  store: DocumentStore,
  choice: KeptFileChoice,
): Promise<boolean> {
  if (!ports.workspace.durable) {
    return false
  }
  try {
    const changed = await store.setAsideSecondFile(choice.id, choice.files)
    if (changed.ok) {
      await clearSecondFileOfRecord(ports, choice.id)
    }
    return changed.ok
  } catch (error) {
    console.error('The second plan file could not be set aside.', error)
    return false
  }
}

/** Opens the second file's document as a new workspace project, named as a copy. */
async function openCopyOfSecondFile(
  ports: SessionPorts,
  held: Held,
  choice: KeptFileChoice,
): Promise<Extract<SecondFileAsNewResult, { readonly ok: true }> | Failed> {
  if (!(await unchanged(held.store, choice))) {
    return FILES_CHANGED
  }
  const read = await held.store.readSecondFile(choice.id)
  if (!read.ok) {
    return read.failure.kind === 'decode'
      ? { ok: false, failure: { kind: 'second-file-unreadable', decode: read.failure.decode } }
      : FILES_CHANGED
  }
  const { project } = read.value
  const created = await openAsNewProject(ports, held.other, {
    project: { ...project, meta: { ...project.meta, name: secondFileCopyName(project.meta.name) } },
    supplied: (needed) => assetsOfFolder(ports, choice.id, needed),
  })
  const secondFileMoved =
    created.ok && created.stored && (await setAsideAfterCopy(ports, held.store, choice))
  return created.ok
    ? { ok: true, handle: created.handle, missingAssets: created.missingAssets, secondFileMoved }
    : created
}

/**
 * Opens the second file's document as a new workspace project and, once that project was stored in
 * durable storage, sets the second files aside. In temporary storage the second file stays. A
 * changed file writes nothing. Never rejects.
 */
export async function openSecondFileAsNew(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  choice: KeptFileChoice,
): Promise<SecondFileAsNewResult> {
  const held = await takeLock(ports, current, choice)
  if (!held.ok) {
    return held
  }
  const result = await underLock(held, () => openCopyOfSecondFile(ports, held, choice))
  return result.ok ? result : finishRefused(ports, held, result)
}
