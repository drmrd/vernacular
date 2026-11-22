import { decodeDocument } from '../../core'
import type { CodecOptions, DecodeFailure, DecodeResult } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE, secondDocumentFileVersion } from '../project-files/project-file-name'
import { sha256Hex, storedVersionOf, writeBackup } from './document-backups'

/** The second document file of a project, and which file the read decoded. */
export interface SecondFileState {
  readonly name: string
  readonly read: 'main' | 'second'
}

/** A second document file with the bytes it holds. */
export interface SecondFileBytes {
  readonly name: string
  readonly bytes: Uint8Array
}

/** A second document file named in the project directory, with the version its name carries. */
export interface SecondFileEntry {
  readonly name: string
  readonly version: number
}

/** Every second document file in the project directory, in listing order. */
export async function listSecondFiles(directory: DirectoryPort): Promise<SecondFileEntry[]> {
  const entries: SecondFileEntry[] = []
  for (const name of await directory.list('')) {
    const version = secondDocumentFileVersion(name)
    if (version !== undefined) {
      entries.push({ name, version })
    }
  }
  return entries
}

function newestUpTo(
  files: readonly SecondFileEntry[],
  version: number,
): SecondFileEntry | undefined {
  return files.filter((file) => file.version <= version).sort((a, b) => b.version - a.version)[0]
}

/**
 * What a read of the main file reports about the second files: the one with the highest version
 * at or below the build's. The order is numeric, so `vernacular.format-10.json` comes before
 * `vernacular.format-9.json`.
 */
export function secondFileBesideMain(
  files: readonly SecondFileEntry[],
  version: number,
): SecondFileState | undefined {
  const newest = newestUpTo(files, version)
  return newest === undefined ? undefined : { name: newest.name, read: 'main' }
}

/**
 * The bytes of the second file with the highest version at or below the given one, whether or not
 * they decode. Undefined when there is no such file or it has gone.
 */
export async function readNewestSecondFile(
  directory: DirectoryPort,
  files: readonly SecondFileEntry[],
  version: number,
): Promise<SecondFileBytes | undefined> {
  const newest = newestUpTo(files, version)
  const bytes = newest === undefined ? undefined : await directory.readFile(newest.name)
  return newest === undefined || bytes === undefined ? undefined : { name: newest.name, bytes }
}

/**
 * The latest time of last change among the main file and every second file, whatever its
 * version. Undefined when one of the times is unknown.
 */
export async function latestChangeOf(
  directory: DirectoryPort,
  files: readonly SecondFileEntry[],
): Promise<string | undefined> {
  const names = [PROJECT_FILE, ...files.map((file) => file.name)]
  const times = await Promise.all(names.map((name) => directory.modifiedAt(name)))
  const known = times.filter((time): time is string => time !== undefined)
  if (known.length < times.length) {
    return undefined
  }
  return known.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest))
}

/** One document file as a choice sees it. `digest` is the SHA-256 of its bytes, in hex. */
export interface DocumentFileFacts {
  readonly name: string
  readonly changedAt: string | undefined
  readonly digest: string
}

/** The main file beside the second file with the highest version at or below the build's. */
export interface TwoDocumentFiles {
  readonly state: 'newer-main' | 'both-readable'
  readonly main: DocumentFileFacts
  readonly second: DocumentFileFacts
}

/** Why a choice between the two files changed nothing. */
export type SecondFileRefusal =
  | { readonly kind: 'files-changed' | 'no-second-file' }
  | { readonly kind: 'second-file-unreadable'; readonly decode: DecodeFailure }

/** The outcome of setting aside or promoting the second file. */
export type SecondFileChange =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: SecondFileRefusal }

/** The two files as they are now, with the bytes that their facts describe. */
export interface StoredTwoFiles {
  readonly files: TwoDocumentFiles
  readonly mainBytes: Uint8Array
  readonly mainDecode: DecodeResult
  readonly second: SecondFileBytes
  readonly listed: SecondFileEntry[]
  readonly buildVersion: number
}

function buildVersionOf(result: DecodeResult): number | undefined {
  if (result.ok) {
    return result.value.project.meta.schemaVersion
  }
  return result.failure.kind === 'newer-version' ? result.failure.buildVersion : undefined
}

async function factsOf(
  directory: DirectoryPort,
  name: string,
  bytes: Uint8Array,
): Promise<DocumentFileFacts> {
  return { name, changedAt: await directory.modifiedAt(name), digest: await sha256Hex(bytes) }
}

/**
 * The main file and its newest second file, when the main file decodes or is newer than the build
 * and a second file at or below the build's version exists. Reads only.
 */
export async function readStoredTwoFiles(
  directory: DirectoryPort,
  options?: CodecOptions,
): Promise<StoredTwoFiles | undefined> {
  const mainBytes = await directory.readFile(PROJECT_FILE)
  if (mainBytes === undefined) {
    return undefined
  }
  const mainDecode = decodeDocument(mainBytes, options)
  const buildVersion = buildVersionOf(mainDecode)
  if (buildVersion === undefined) {
    return undefined
  }
  const listed = await listSecondFiles(directory)
  const second = await readNewestSecondFile(directory, listed, buildVersion)
  if (second === undefined) {
    return undefined
  }
  const files: TwoDocumentFiles = {
    state: mainDecode.ok ? 'both-readable' : 'newer-main',
    main: await factsOf(directory, PROJECT_FILE, mainBytes),
    second: await factsOf(directory, second.name, second.bytes),
  }
  return { files, mainBytes, mainDecode, second, listed, buildVersion }
}

function sameFiles(now: TwoDocumentFiles, expected: TwoDocumentFiles): boolean {
  return (
    now.state === expected.state &&
    now.main.name === expected.main.name &&
    now.main.digest === expected.main.digest &&
    now.second.name === expected.second.name &&
    now.second.digest === expected.second.digest
  )
}

async function checkedTwoFiles(
  directory: DirectoryPort,
  expected: TwoDocumentFiles,
  options?: CodecOptions,
): Promise<StoredTwoFiles | SecondFileRefusal> {
  const stored = await readStoredTwoFiles(directory, options)
  if (stored === undefined) {
    return { kind: 'no-second-file' }
  }
  return sameFiles(stored.files, expected) ? stored : { kind: 'files-changed' }
}

/** Moves each second file at or below the build's version to the backups: copy first, then remove. */
async function setAsideEachSecondFile(
  directory: DirectoryPort,
  stored: StoredTwoFiles,
): Promise<void> {
  for (const file of stored.listed.filter(({ version }) => version <= stored.buildVersion)) {
    const bytes = await directory.readFile(file.name)
    if (bytes !== undefined) {
      await writeBackup(directory, 'set-aside-second-file', { version: file.version, bytes })
      await directory.removeFile(file.name)
    }
  }
}

/** Sets every second file at or below the build's version aside, when the files are as expected. */
export async function setAsideSecondFiles(
  directory: DirectoryPort,
  expected: TwoDocumentFiles,
  options?: CodecOptions,
): Promise<SecondFileChange> {
  const checked = await checkedTwoFiles(directory, expected, options)
  if (!('files' in checked)) {
    return { ok: false, refusal: checked }
  }
  await setAsideEachSecondFile(directory, checked)
  return { ok: true }
}

/**
 * Makes the main file hold the second file's bytes, when the files are as expected and the second
 * file decodes. The main file's bytes reach the backups first, and the second files go last.
 */
export async function promoteSecondFile(
  directory: DirectoryPort,
  expected: TwoDocumentFiles,
  options?: CodecOptions,
): Promise<SecondFileChange> {
  const checked = await checkedTwoFiles(directory, expected, options)
  if (!('files' in checked)) {
    return { ok: false, refusal: checked }
  }
  const secondDecode = decodeDocument(checked.second.bytes, options)
  if (!secondDecode.ok) {
    return { ok: false, refusal: { kind: 'second-file-unreadable', decode: secondDecode.failure } }
  }
  const replaced = { version: storedVersionOf(checked.mainDecode), bytes: checked.mainBytes }
  await writeBackup(directory, 'replaced-by-second-file', replaced)
  await directory.writeFile(PROJECT_FILE, checked.second.bytes)
  await setAsideEachSecondFile(directory, checked)
  return { ok: true }
}
