import type { Project } from '../../core'
import {
  InMemoryDirectory,
  InMemoryFolderAccess,
  InMemoryProjectLockPort,
  InMemoryProjectStore,
} from '../../storage'
import type { DocumentStore } from '../../storage'
import type { SessionPorts } from '../ports'
import type { DocumentHandle, OpenFailure, OpenRequest } from './handle-types'
import { openDocumentHandle } from './open-document-handle'

/** Test support: in-memory ports and the helpers that the handle tests share. */

/** The name of the document in a project directory and at the root of a folder. */
export const DOCUMENT_FILE = 'vernacular.json'

/** The location of a project in the workspace of this browser. */
export const IN_WORKSPACE = { kind: 'workspace' } as const

/** The location of a project in a folder that the user picked. */
export const IN_FOLDER = { kind: 'folder', folderName: 'Old house' } as const

export interface TestPorts extends SessionPorts {
  readonly workspace: InMemoryProjectStore
  readonly locks: InMemoryProjectLockPort
  readonly folders: InMemoryFolderAccess
  /** The directory under the workspace: a document is at `<id>/vernacular.json`. */
  readonly root: InMemoryDirectory
  readonly lockRegistry: Set<string>
}

/** In-memory ports. Give the `root` and `lockRegistry` of another call to act as a second tab. */
export function createTestPorts(
  shared: { root?: InMemoryDirectory; lockRegistry?: Set<string> } = {},
): TestPorts {
  const root = shared.root ?? new InMemoryDirectory()
  const lockRegistry = shared.lockRegistry ?? new Set<string>()
  return {
    workspace: new InMemoryProjectStore(root),
    locks: new InMemoryProjectLockPort(lockRegistry),
    folders: new InMemoryFolderAccess(),
    root,
    lockRegistry,
    now: () => new Date(),
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
