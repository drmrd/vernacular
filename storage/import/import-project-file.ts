import type { Project } from '../../core'
import { migrateProject } from '../../core'
import { parseProjectJson } from '../folder/project-json'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'

/** Thrown when a file name's extension matches no supported project decoder. */
export class UnsupportedProjectFileError extends Error {
  readonly fileName: string

  constructor(fileName: string) {
    super(`Unsupported project file: ${fileName}`)
    this.name = 'UnsupportedProjectFileError'
    this.fileName = fileName
  }
}

/** Import a project from file bytes, selecting a decoder by the file name's extension. */
export async function importProjectFile(
  name: string,
  bytes: Uint8Array,
  id: string,
): Promise<Project> {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.building')) {
    return (await ZipBundleProjectStore.fromBundle(id, bytes)).load(id)
  }
  if (lowerName.endsWith('.json')) {
    return migrateProject(parseProjectJson(bytes))
  }
  throw new UnsupportedProjectFileError(name)
}
