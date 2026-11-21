import { expect } from 'vitest'
import { renamed, currentBytes } from '../../tests/storage/conformance/conformance-documents'
import type { DirectoryPort, DocumentStore } from '../../storage'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import type { DocumentHandle } from './handle-types'
import { openDocumentHandle } from './open-document-handle'

/** Test support: stored projects with a recovery copy that cannot be read, and what became of it. */

export const PROJECT_ID = 'a'
export const AUTOSAVE_FOLDER = '.house-autosave'
export const BACKUP_FOLDER = '.house-backups'

/** The name of a recovery copy that is the oldest one that a test plants. */
export const REFUSED_COPY_NAME = 'snapshot-1.json'

/** The name of a recovery copy that sorts after every copy that the store writes: the newest. */
export const NEWEST_COPY_NAME = 'snapshot-9999999999999.json'

/** The text of a recovery copy that is not JSON. */
export const REFUSED_TEXT = '{"this copy": is not json'

/** The name that the store gives the backup of a copy that is no project: version 0, then the digest. */
export const REFUSED_BACKUP_NAME = /^refused-snapshot-v0-[0-9a-f]{64}\.json$/

/** The one backup that a copy with the text of `REFUSED_TEXT` leaves behind. */
export const THE_REFUSED_BACKUP = [
  { name: expect.stringMatching(REFUSED_BACKUP_NAME), text: REFUSED_TEXT },
]

/** The name of the recovered project that a copy that can be read holds. */
export const READABLE_NAME = 'Recovered after a crash'

/** The directory of the recovery copies of the project `id` in the workspace. */
export function autosaveFolderOf(id: string): string {
  return `${id}/${AUTOSAVE_FOLDER}`
}

/** The directory of the backups of the project `id` in the workspace. */
export function backupFolderOf(id: string): string {
  return `${id}/${BACKUP_FOLDER}`
}

/** The bytes of a recovery copy that is not JSON. */
export function refusedBytes(): Uint8Array {
  return new TextEncoder().encode(REFUSED_TEXT)
}

/** The text that `bytes` hold, or undefined when there is no file. */
export function textOf(bytes: Uint8Array | undefined): string | undefined {
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes)
}

/** Puts a recovery copy that is not JSON under `name` in the directory `folder` of `root`. */
export function plantRefusedCopy(
  root: DirectoryPort,
  folder: string,
  name = REFUSED_COPY_NAME,
): Promise<void> {
  return root.writeFile(`${folder}/${name}`, refusedBytes())
}

/** Stores a sound project `a`, and puts a recovery copy that is not JSON beside it. */
export async function portsWithRefusedCopy(name = REFUSED_COPY_NAME): Promise<TestPorts> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  await plantRefusedCopy(ports.root, autosaveFolderOf(PROJECT_ID), name)
  return ports
}

/** Writes a recovery copy that can be read, of the stored project `a`, through the real store. */
export async function writeReadableCopy(ports: TestPorts): Promise<void> {
  const project = await storedProject(ports.workspace, PROJECT_ID)
  await ports.workspace.snapshots(PROJECT_ID).writeSnapshot(renamed(project, READABLE_NAME))
}

/** What a backup of a recovery copy that cannot be read looks like in a directory listing. */
export interface BackedUpCopy {
  readonly name: string
  readonly text: string | undefined
}

/** Each backup of a refused recovery copy in `folder` of `root`, by name and text. */
export async function refusedBackupsIn(
  root: DirectoryPort,
  folder: string,
): Promise<BackedUpCopy[]> {
  const names = (await root.list(folder)).filter((name) => name.startsWith('refused-snapshot-'))
  return Promise.all(
    names.map(async (name) => ({ name, text: textOf(await root.readFile(`${folder}/${name}`)) })),
  )
}

/** The names of the files in `folder` of `root`, in order. */
export async function namesIn(root: DirectoryPort, folder: string): Promise<string[]> {
  return (await root.list(folder)).sort()
}

/** Every notice that reaches a listener attached now, while it stays attached. */
export function noticesOf(handle: DocumentHandle): string[] {
  const notices: string[] = []
  handle.onNotice((notice) => notices.push(notice))
  return notices
}

/** The handle of the project `a` opened with the option that leaves the snapshots alone. */
export async function openLeavingSnapshots(ports: TestPorts): Promise<DocumentHandle> {
  const opened = await openDocumentHandle(ports, workspaceRequest(PROJECT_ID), {
    leaveSnapshots: true,
  })
  if (!opened.ok) throw new Error(`Expected the open to succeed: ${JSON.stringify(opened.failure)}`)
  return opened.handle
}

/** A handle on the project `a` of `ports`. Throws, naming the failure, when it does not open. */
export function openProject(ports: TestPorts): Promise<DocumentHandle> {
  return openOrThrow(ports, workspaceRequest(PROJECT_ID))
}

/**
 * From now on each `snapshots(id)` of the store gives the real snapshots, except that
 * `setAsideRefused` rejects with `error`. The returned log holds `writeSnapshot:<id>` and
 * `prune:<id>` for each call of those two. Call this before the open: a handle asks the store for
 * its snapshots once, when it opens.
 */
export function rejectSetAside(store: DocumentStore, error: Error): string[] {
  const log: string[] = []
  const realSnapshots = store.snapshots.bind(store)
  store.snapshots = (id) => {
    const real = realSnapshots(id)
    return {
      writeSnapshot: (project) => {
        log.push(`writeSnapshot:${id}`)
        return real.writeSnapshot(project)
      },
      prune: () => {
        log.push(`prune:${id}`)
        return real.prune()
      },
      isRecoverable: () => real.isRecoverable(),
      restore: () => real.restore(),
      setAsideRefused: () => Promise.reject(error),
    }
  }
  return log
}
