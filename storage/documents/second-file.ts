import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE, secondDocumentFileVersion } from '../project-files/project-file-name'

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
