import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { CodecOptions, Project } from '../../core'
import { bytesOf, metaOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  NOT_JSON,
  SECOND_FILE_PROJECT_NAME,
  documentOfNewerVersion,
  newerVersionDocument,
  soundSecondFile,
  twoFilesOrThrow,
} from '../../tests/storage/conformance/conformance-documents'
import {
  SECOND_FILE_NAME,
  SET_ASIDE_PREFIX,
  UNREADABLE_PREFIX,
  filesUnder,
} from '../../tests/storage/conformance/conformance-run'
import type { NamedBytes } from '../../tests/storage/conformance/conformance-run'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { ProjectNotFoundError } from '../project-store'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { DocumentDecodeError } from './document-decode-error'
import { WorkspaceDocumentStore } from './document-store'
import type { DocumentStore } from './document-store'
import type { TwoDocumentFiles } from './second-file'

/** Shared set-up of the tests that cover a document store over the project `a` of a workspace. */

/** The document of the project `a`. */
export const DOCUMENT_PATH = 'a/vernacular.json'

export { NOT_JSON, SECOND_FILE_NAME, SECOND_FILE_PROJECT_NAME, soundSecondFile, twoFilesOrThrow }
export { UNREADABLE_PREFIX }

/** The second document file of the project `a`. */
export const SECOND_FILE_PATH = `a/${SECOND_FILE_NAME}`

/** A second document file of the project `a` that a build with the next schema version wrote. */
export const NEWER_SECOND_FILE_PATH = `a/vernacular.format-${CURRENT_SCHEMA_VERSION + 1}.json`

/** The directory that holds the backups of the project `a`. */
export const BACKUP_DIRECTORY = 'a/.house-backups'

const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2
const DIGEST_PATTERN = '[0-9a-f]{64}'

/** What the directory that refuses a backup write rejects with. */
export const DISK_FULL_MESSAGE = 'the disk is full'

/** The name of a copy of an unreadable file stored at `version`: the prefix, the version, a digest. */
export function unreadableNamePattern(version: number): RegExp {
  return new RegExp(`^${UNREADABLE_PREFIX}v${version}-${DIGEST_PATTERN}\\.json$`)
}

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

/** Test support: rejects each write under a backup directory and passes everything else through. */
export class BackupRefusingDirectory extends PassThroughDirectory {
  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.includes('.house-backups/')) return Promise.reject(new Error(DISK_FULL_MESSAGE))
    return super.writeFile(path, bytes)
  }
}

/** Test support: rejects each write of a copy of a set-aside second file and passes everything else through. */
export class SetAsideRefusingDirectory extends PassThroughDirectory {
  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.includes(`.house-backups/${SET_ASIDE_PREFIX}`)) {
      return Promise.reject(new Error(DISK_FULL_MESSAGE))
    }
    return super.writeFile(path, bytes)
  }
}

/**
 * Test support: passes every call through and lists each write and each removal, in the order
 * that they happened, as `write <path>` and `remove <path>`.
 */
export class ChangeLoggingDirectory extends PassThroughDirectory {
  readonly calls: string[] = []

  /** The path of each removal, in order. */
  readonly removals: string[] = []

  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.calls.push(`write ${path}`)
    return super.writeFile(path, bytes)
  }

  override removeFile(path: string): Promise<void> {
    this.removals.push(path)
    this.calls.push(`remove ${path}`)
    return super.removeFile(path)
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

/**
 * A root that holds the document files of the project `a` for which there are bytes. `aboveBuild`
 * is the second document file of a build with the next schema version.
 */
export async function rootHoldingFiles(files: {
  main?: Uint8Array
  second?: Uint8Array
  aboveBuild?: Uint8Array
}): Promise<InMemoryDirectory> {
  const root = await rootHolding(files.main)
  if (files.second !== undefined) await root.writeFile(SECOND_FILE_PATH, files.second)
  if (files.aboveBuild !== undefined) await root.writeFile(NEWER_SECOND_FILE_PATH, files.aboveBuild)
  return root
}

/** The document of the current version, stored as a build with the next schema version writes it. */
export const newerVersionBytes = documentOfNewerVersion

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
export function backupsOf(root: DirectoryPort): Promise<NamedBytes[]> {
  return filesUnder(root, BACKUP_DIRECTORY)
}

/** The SHA-256 of `bytes`, in hex, as a backup name and a choice between two files carry it. */
export async function digestOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0'),
  ).join('')
}

/** The name of the backup of `bytes` that was kept as `kind` for a file stored at `version`. */
export async function backupNameOf(
  kind: string,
  version: number,
  bytes: Uint8Array,
): Promise<string> {
  return `${kind}-v${version}-${await digestOf(bytes)}.json`
}

/** A main file of a newer build that differs in its bytes from `newerVersionBytes()`. */
export function anotherNewerMainFile(): Uint8Array {
  const document = newerVersionDocument()
  metaOf(document).name = 'Another project of a newer build'
  return bytesOf(document)
}

/** What a call rejects with; undefined when the call resolves. */
export function rejectionOf(call: () => Promise<unknown>): Promise<unknown> {
  return call().then(
    () => undefined,
    (error: unknown) => error,
  )
}

/**
 * A newer main file beside a sound second file, and a store over them that logs each write and
 * removal, with the two files as a choice between them sees them.
 */
export async function choiceOfTwoFiles(): Promise<{
  root: InMemoryDirectory
  logged: ChangeLoggingDirectory
  store: DocumentStore
  files: TwoDocumentFiles
}> {
  const root = await rootHoldingFiles({ main: newerVersionBytes(), second: soundSecondFile() })
  const logged = new ChangeLoggingDirectory(root)
  const store = storeOver(logged)
  return { root, logged, store, files: await twoFilesOrThrow(store) }
}
