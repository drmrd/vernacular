import { renameProject } from '../../core'
import type { Project } from '../../core'
import {
  InMemoryDirectory,
  InMemoryFolderAccess,
  InMemoryProjectIndex,
  InMemoryProjectLockPort,
  InMemoryProjectStore,
  WorkspaceDocumentStore,
  WorkspaceFiles,
} from '../../storage'
import type {
  DocumentStore,
  ProjectIndex,
  ProjectLockHold,
  ProjectLockPort,
  ProjectRecord,
} from '../../storage'
import { settle } from '../autosave/save-gate-test-kit'
import type { SessionPorts } from '../ports'
import type { DocumentHandle, OpenFailure, OpenRequest, SaveOutcome } from './handle-types'
import { openDocumentHandle } from './open-document-handle'

/** Test support: in-memory ports and the helpers that the handle tests share. */

/** The name of the document in a project directory and at the root of a folder. */
export const DOCUMENT_FILE = 'vernacular.json'

/** The location of a project in the workspace of this browser. */
export const IN_WORKSPACE = { kind: 'workspace' } as const

/** The location of a project in a folder that the user picked. */
export const IN_FOLDER = { kind: 'folder', folderName: 'Old house' } as const

/** The build that test ports write into each record, unless a test gives another. */
export const TEST_BUILD = 'test-build'

export interface TestPorts extends SessionPorts {
  readonly workspace: WorkspaceDocumentStore
  readonly locks: InMemoryProjectLockPort
  readonly folders: InMemoryFolderAccess
  /** The project index: a new in-memory index, unless a test gives one. */
  readonly index: ProjectIndex
  /** The version written into each record. */
  readonly build: string
  /** The directory under the workspace: a document is at `<id>/vernacular.json`. */
  readonly root: InMemoryDirectory
  readonly lockRegistry: Set<string>
}

export interface TestPortsOptions {
  /** The directory of another call: a second tab, or a reload of the same browser. */
  readonly root?: InMemoryDirectory
  /** The lock registry of another call: a second tab of the same browser. */
  readonly lockRegistry?: Set<string>
  /** True for a workspace over durable files, as the stores of a browser are. Default false. */
  readonly durable?: boolean
  /** The index of another call (a second tab, or a reload), or one that misbehaves. */
  readonly index?: ProjectIndex
  /** The build of the ports. Default `TEST_BUILD`. */
  readonly build?: string
  /** The clock of the ports. Default the present time. */
  readonly now?: () => Date
}

/** The workspace over `root`: durable files when asked, otherwise the in-memory store. */
function workspaceOver(root: InMemoryDirectory, durable: boolean): WorkspaceDocumentStore {
  if (!durable) return new InMemoryProjectStore(root)
  return new WorkspaceDocumentStore(new WorkspaceFiles(root, { durable: true }))
}

/**
 * In-memory ports. Give the `root`, `lockRegistry`, and `index` of another call to act as a second
 * tab, or the `root` and `index` alone to act as a reload.
 */
export function createTestPorts(options: TestPortsOptions = {}): TestPorts {
  const root = options.root ?? new InMemoryDirectory()
  const lockRegistry = options.lockRegistry ?? new Set<string>()
  return {
    workspace: workspaceOver(root, options.durable ?? false),
    locks: new InMemoryProjectLockPort(lockRegistry),
    folders: new InMemoryFolderAccess(),
    root,
    lockRegistry,
    now: options.now ?? (() => new Date()),
    index: options.index ?? new InMemoryProjectIndex(),
    build: options.build ?? TEST_BUILD,
  }
}

/** Lets the microtasks settle, so that a started record write ends, then reads the record. */
export async function recordOf(
  ports: { readonly index: ProjectIndex },
  id: string,
): Promise<ProjectRecord | undefined> {
  await settle()
  return ports.index.get(id)
}

export interface MovableClock {
  readonly now: () => Date
  moveTo(time: Date): void
}

/** A clock that stays at `start` until the test moves it. */
export function movableClock(start: Date): MovableClock {
  let time = start
  return {
    now: () => time,
    moveTo: (next) => {
      time = next
    },
  }
}

/** Stores `bytes` as the document of the project `id` in the workspace of `ports`. */
export function placeDocument(ports: TestPorts, id: string, bytes: Uint8Array): Promise<void> {
  return ports.root.writeFile(`${id}/${DOCUMENT_FILE}`, bytes)
}

/**
 * Remembers a new folder under `id`, with `bytes` as its document when there are bytes. The
 * permission stays the default of the folder access, `granted`, until the test sets another.
 */
export async function rememberFolder(
  ports: TestPorts,
  id: string,
  bytes?: Uint8Array,
): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  if (bytes !== undefined) await directory.writeFile(DOCUMENT_FILE, bytes)
  await ports.folders.remember(id, ports.folders.addFolder(directory))
  return directory
}

/** The request to open the project `id` of the workspace. */
export function workspaceRequest(id: string): OpenRequest {
  return { id, location: IN_WORKSPACE }
}

/** The project that `store` holds under `id`. Throws, naming the failure, when the read fails. */
export async function storedProject(store: DocumentStore, id: string): Promise<Project> {
  const read = await store.read(id)
  if (!read.ok) throw new Error(`Expected a stored project: ${JSON.stringify(read.failure)}`)
  return read.value.project
}

/** The handle of an open that must succeed. Throws, naming the failure, otherwise. */
export async function openOrThrow(
  ports: SessionPorts,
  request: OpenRequest,
): Promise<DocumentHandle> {
  const result = await openDocumentHandle(ports, request)
  if (!result.ok) throw new Error(`Expected the open to succeed: ${JSON.stringify(result.failure)}`)
  return result.handle
}

/** The failure of an open that must fail. Throws when it opens. */
export async function failureOf(ports: SessionPorts, request: OpenRequest): Promise<OpenFailure> {
  const result = await openDocumentHandle(ports, request)
  if (result.ok) throw new Error(`Expected the open of ${request.id} to fail`)
  return result.failure
}

/** What a switch or a flow gives: the handle now open, or why none opened. */
export type OpenedOrNot =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: unknown }

/** The handle of a switch or a flow that must open a project. Throws, naming the failure, otherwise. */
export function handleOf(result: OpenedOrNot): DocumentHandle {
  if (!result.ok) throw new Error(`Expected a project to open: ${JSON.stringify(result.failure)}`)
  return result.handle
}

/** Renames the open project through its session, as an edit of the user does. */
export function rename(handle: DocumentHandle, name: string): void {
  handle.session.dispatch(renameProject(name))
}

/** The name of the project that `store` holds under `id`. */
export async function storedName(store: DocumentStore, id: string): Promise<string> {
  return (await storedProject(store, id)).meta.name
}

/** From now on each save of the store puts `save:<id>` in the log, then runs the real save. */
export function recordSaves(store: DocumentStore, log: string[]): void {
  const realSave = store.save.bind(store)
  store.save = (id, project) => {
    log.push(`save:${id}`)
    return realSave(id, project)
  }
}

/** A step of the snapshots of a project that a test can make fail. */
export type SnapshotStep = 'writeSnapshot' | 'prune'

/** The step of the snapshots that rejects, and the error it rejects with. */
export interface SnapshotFailure {
  readonly step: SnapshotStep
  readonly error: Error
}

/**
 * From now on each `snapshots(id)` of the store gives the real snapshots of `id`, whose
 * `writeSnapshot` and `prune` put `writeSnapshot:<id>` and `prune:<id>` in the log when called.
 * The step of `failure`, when one is given, rejects with its error instead of running. A handle
 * asks the store for its snapshots when it opens, so call this before the open.
 */
export function recordSnapshots(
  store: DocumentStore,
  log: string[],
  failure?: SnapshotFailure,
): void {
  const realSnapshots = store.snapshots.bind(store)
  store.snapshots = (id) => {
    const real = realSnapshots(id)
    const step = (name: SnapshotStep, run: () => Promise<void>): Promise<void> => {
      log.push(`${name}:${id}`)
      return failure?.step === name ? Promise.reject(failure.error) : run()
    }
    return {
      writeSnapshot: (project) => step('writeSnapshot', () => real.writeSnapshot(project)),
      prune: () => step('prune', () => real.prune()),
      isRecoverable: () => real.isRecoverable(),
      restore: () => real.restore(),
      setAsideRefused: () => Promise.resolve(0),
    }
  }
}

/**
 * From now on the directory of `ports` cannot remove a file: each removal rejects with the error
 * that this gives back. Writes and reads work as before. The snapshots of the workspace remove
 * their old files through this directory, and so does a prune.
 */
export function failFileRemovals(ports: TestPorts): Error {
  const error = new Error('the file cannot be removed')
  ports.root.removeFile = () => Promise.reject(error)
  return error
}

/**
 * From now on the directory of `ports` cannot tell when a file last changed, as some stores of a
 * browser cannot. A read and a save then report no time of change.
 */
export function hideTimesOfChange(ports: TestPorts): void {
  ports.root.modifiedAt = () => Promise.resolve(undefined)
}

/** Puts `save:<id>` and `read:<id>` in the log for each call, then runs the real method. */
function recordStoreCalls(store: DocumentStore, log: string[]): void {
  const realRead = store.read.bind(store)
  recordSaves(store, log)
  store.read = (id) => {
    log.push(`read:${id}`)
    return realRead(id)
  }
}

/** An in-memory lock port that puts `lock:<id>` and `unlock:<id>` in the log. */
class RecordingLocks extends InMemoryProjectLockPort {
  constructor(
    registry: Set<string>,
    private readonly log: string[],
  ) {
    super(registry)
  }

  override async tryAcquire(id: string): Promise<ProjectLockHold | undefined> {
    this.log.push(`lock:${id}`)
    const hold = await super.tryAcquire(id)
    if (hold === undefined) return undefined
    return {
      release: () => {
        this.log.push(`unlock:${id}`)
        return hold.release()
      },
    }
  }
}

/** Ports whose store and locks report each call to `log`, in the order of the calls. */
export function recordingPorts(log: string[]): TestPorts {
  const ports = createTestPorts()
  recordStoreCalls(ports.workspace, log)
  return { ...ports, locks: new RecordingLocks(ports.lockRegistry, log) }
}

/** The next `read` of the store stays pending until the returned function is called. */
export function holdNextRead(store: DocumentStore): () => void {
  const realRead = store.read.bind(store)
  let letGo: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    letGo = resolve
  })
  store.read = async (id) => {
    store.read = realRead
    await gate
    return realRead(id)
  }
  return () => letGo()
}

/** From now on every save of the store rejects, after it has been put in the log. */
export function failSaves(store: DocumentStore, log: string[] = []): void {
  store.save = (id) => {
    log.push(`save:${id}`)
    return Promise.reject(new Error('disk full'))
  }
}

/** The stand-in handle that `addFolder` gives, the type the folder picker answers with. */
export type PickedFolder = ReturnType<InMemoryFolderAccess['addFolder']>

/**
 * Makes the next pick of the folder access give a stand-in handle for `directory`, named `name`
 * when a name is given. Returns that handle.
 */
export function pickFolder(
  ports: TestPorts,
  directory: InMemoryDirectory,
  name?: string,
): PickedFolder {
  const picked = ports.folders.addFolder(directory)
  if (name !== undefined) Object.defineProperty(picked, 'name', { value: name })
  ports.folders.pickNext(picked)
  return picked
}

export type Settlement<T> =
  | { status: 'pending' }
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; error: unknown }

/** Follows any promise so that a test can ask, without timers, whether it has settled yet. */
export function settlementOf<T>(promise: Promise<T>): () => Settlement<T> {
  let settlement: Settlement<T> = { status: 'pending' }
  promise.then(
    (value) => {
      settlement = { status: 'resolved', value }
    },
    (error: unknown) => {
      settlement = { status: 'rejected', error }
    },
  )
  return () => settlement
}

export type Followed =
  | { status: 'pending' }
  | { status: 'resolved'; outcome: SaveOutcome }
  | { status: 'rejected'; error: unknown }

/** Follows a promise so that a test can ask, without timers, whether it has settled yet. */
export function follow(promise: Promise<SaveOutcome>): () => Followed {
  let followed: Followed = { status: 'pending' }
  promise.then(
    (outcome) => {
      followed = { status: 'resolved', outcome }
    },
    (error: unknown) => {
      followed = { status: 'rejected', error }
    },
  )
  return () => followed
}

export interface ControlledLocks {
  readonly port: ProjectLockPort
  /** How many times `release()` was called on a hold of this port. */
  releases(): number
  /**
   * Lets every release end, now and later. A release frees its lock only when it has been called
   * and this has been called, in either order.
   */
  endRelease(): void
}

/** A lock port for one tab whose releases stay pending until the test ends them. */
export function createControlledLocks(): ControlledLocks {
  const held = new Set<string>()
  let releaseCalls = 0
  let allow: () => void = () => undefined
  const allowed = new Promise<void>((resolve) => {
    allow = resolve
  })
  const holdOf = (id: string) => ({
    release: () => {
      releaseCalls += 1
      return allowed.then(() => {
        held.delete(id)
      })
    },
  })
  const port: ProjectLockPort = {
    supported: true,
    tryAcquire: (id) => {
      if (held.has(id)) return Promise.resolve(undefined)
      held.add(id)
      return Promise.resolve(holdOf(id))
    },
    heldIds: () => Promise.resolve(new Set(held)),
  }
  return { port, releases: () => releaseCalls, endRelease: () => allow() }
}
