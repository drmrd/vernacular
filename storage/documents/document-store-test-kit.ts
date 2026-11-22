import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { CodecOptions, Project } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { ProjectNotFoundError } from '../project-store'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { DocumentDecodeError } from './document-decode-error'
import { WorkspaceDocumentStore } from './document-store'
import type { DocumentStore } from './document-store'

/** Shared set-up of the tests that cover a document store over the project `a` of a workspace. */

/** The document of the project `a`. */
export const DOCUMENT_PATH = 'a/vernacular.json'

/** The name of the second document file that this build writes beside a newer main file. */
export const SECOND_FILE_NAME = `vernacular.format-${CURRENT_SCHEMA_VERSION}.json`

/** The second document file of the project `a`. */
export const SECOND_FILE_PATH = `a/${SECOND_FILE_NAME}`

/** The directory that holds the backups of the project `a`. */
export const BACKUP_DIRECTORY = 'a/.house-backups'

/**
 * Test support: passes every call to another directory. A test extends it and overrides the one
 * member that it records or makes fail.
 */
export class PassThroughDirectory implements DirectoryPort {
  constructor(protected readonly inner: DirectoryPort) {}

  readFile(path: string): Promise<Uint8Array | undefined> {
    return this.inner.readFile(path)
  }

  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    return this.inner.writeFile(path, bytes)
  }

  removeFile(path: string): Promise<void> {
    return this.inner.removeFile(path)
  }

  list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix)
  }

  modifiedAt(path: string): Promise<string | undefined> {
    return this.inner.modifiedAt(path)
  }

  removeTree(prefix: string): Promise<void> {
    return this.inner.removeTree(prefix)
  }
}

/** Test support: passes every call through and counts the reads. */
export class ReadCountingDirectory extends PassThroughDirectory {
  reads = 0

  override async readFile(path: string): Promise<Uint8Array | undefined> {
    this.reads += 1
    return super.readFile(path)
  }
}

/** Test support: passes every call through and lists the path of each write, in order. */
export class WriteLoggingDirectory extends PassThroughDirectory {
  readonly writes: string[] = []

  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.writes.push(path)
    return super.writeFile(path, bytes)
  }
}

/** A store over the workspace that `root` holds. */
export function storeOver(
  root: DirectoryPort,
  options?: CodecOptions,
  durable = true,
): WorkspaceDocumentStore {
  return new WorkspaceDocumentStore(new WorkspaceFiles(root, { durable }), options)
}

/**
 * Test support: the project that the store holds under `id`, read back. An ok read gives the
 * project. A project that the store does not hold throws `ProjectNotFoundError`. A document that
 * fails to decode, for any reason, throws `DocumentDecodeError` with the failure.
 */
export async function readProject(store: DocumentStore, id: string): Promise<Project> {
  const read = await store.read(id)
  if (read.ok) return read.value.project
  if (read.failure.kind === 'not-found') throw new ProjectNotFoundError(id)
  throw new DocumentDecodeError(read.failure.decode)
}

/** A root that holds the document of the project `a`, when there are bytes, and nothing else. */
export async function rootHolding(
  bytes: Uint8Array | undefined,
  now?: () => Date,
): Promise<InMemoryDirectory> {
  const root = new InMemoryDirectory(now === undefined ? {} : { now })
  if (bytes !== undefined) await root.writeFile(DOCUMENT_PATH, bytes)
  return root
}

/** A root that holds the document files of the project `a` for which there are bytes. */
export async function rootHoldingFiles(files: {
  main?: Uint8Array
  second?: Uint8Array
}): Promise<InMemoryDirectory> {
  const root = await rootHolding(files.main)
  if (files.second !== undefined) await root.writeFile(SECOND_FILE_PATH, files.second)
  return root
}

/** The document of the current version, stored as a build with the next schema version writes it. */
export function newerVersionBytes(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
  return bytesOf(document)
}

/** Every file under `prefix`, keyed by its path from the root, with its bytes. */
export async function treeOf(root: DirectoryPort, prefix = ''): Promise<Record<string, number[]>> {
  const tree: Record<string, number[]> = {}
  for (const name of await root.list(prefix)) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    const bytes = await root.readFile(path)
    if (bytes === undefined) Object.assign(tree, await treeOf(root, path))
    else tree[path] = Array.from(bytes)
  }
  return tree
}

/** The files of the backup directory of the project `a`: each name with its bytes. */
export async function backupsOf(
  root: DirectoryPort,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const names = await root.list(BACKUP_DIRECTORY)
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: (await root.readFile(`${BACKUP_DIRECTORY}/${name}`)) ?? new Uint8Array(),
    })),
  )
}
