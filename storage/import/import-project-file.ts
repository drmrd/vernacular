import type { Project } from '../../core'
import { migrateProject } from '../../core'
import { parseProjectJson } from '../folder/project-json'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'

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
  throw new Error(`Unsupported project file: ${name}`)
}
