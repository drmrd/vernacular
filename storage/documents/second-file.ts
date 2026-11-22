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

async function secondFileNames(directory: DirectoryPort): Promise<string[]> {
  const names = await directory.list('')
  return names.filter((name) => secondDocumentFileVersion(name) !== undefined)
}

/**
 * The second files at or below the version, highest version first. The order is numeric, so
 * `vernacular.format-10.json` comes before `vernacular.format-9.json`.
 */
export async function secondFilesUpTo(
  directory: DirectoryPort,
  version: number,
): Promise<string[]> {
  const versionOf = (name: string): number => secondDocumentFileVersion(name) ?? 0
  return (await secondFileNames(directory))
    .filter((name) => versionOf(name) <= version)
    .sort((first, second) => versionOf(second) - versionOf(first))
}

/** The second file with the highest version at or below the given one, with its bytes. */
export async function newestSecondFile(
  directory: DirectoryPort,
  version: number,
): Promise<SecondFileBytes | undefined> {
  const [name] = await secondFilesUpTo(directory, version)
  const bytes = name === undefined ? undefined : await directory.readFile(name)
  return name === undefined || bytes === undefined ? undefined : { name, bytes }
}

/**
 * The latest time of last change among the main file and every second file, whatever its
 * version. Undefined when one of the times is unknown.
 */
export async function latestChangeOf(directory: DirectoryPort): Promise<string | undefined> {
  const names = [PROJECT_FILE, ...(await secondFileNames(directory))]
  const times = await Promise.all(names.map((name) => directory.modifiedAt(name)))
  const known = times.filter((time): time is string => time !== undefined)
  if (known.length < times.length) {
    return undefined
  }
  return known.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest))
}
