import type { AssetReference, Project } from '../../core'
import {
  assetEntry,
  contentHashOf,
  projectArchive,
  projectReferring,
  seededBytes,
} from '../../storage/zip/zip-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import type { ImportResult } from './import-file'

/** Test support: the assets, the archive, and the write log that the tests of the import flow share. */

export const POOL_FOLDER = 'assets/'
export const OTHER_ID = 'b'
const MODEL_LENGTH = 4096
export const MODEL = seededBytes(MODEL_LENGTH)
export const IMAGE = new TextEncoder().encode('bytes of an underlay image')

/** A project that places a furniture model and lays an underlay image, with the hashes of both. */
export async function house(extra: readonly AssetReference[] = []) {
  const model = await contentHashOf(MODEL)
  const image = await contentHashOf(IMAGE)
  const project = projectReferring(
    [{ scope: 'user', contentHash: model }, ...extra],
    [{ scope: 'project', contentHash: image }],
  )
  return { model, image, project }
}

/** The archive of the house with both of its assets. */
export async function completeArchive(project: Project): Promise<Uint8Array> {
  return projectArchive(project, [await assetEntry(MODEL), await assetEntry(IMAGE)])
}

/** The handle and the missing assets of an import that must open a project. */
export function importedOf(result: ImportResult): {
  handle: DocumentHandle
  missingAssets: unknown
} {
  if (!result.ok) throw new Error(`Expected a project to open: ${JSON.stringify(result.failure)}`)
  return { handle: result.handle, missingAssets: result.missingAssets }
}

/** From now on each path written to the directory of `ports` goes into the returned log. */
export function logWrites(ports: TestPorts): string[] {
  const log: string[] = []
  const write = ports.root.writeFile.bind(ports.root)
  ports.root.writeFile = (path, bytes) => {
    log.push(path)
    return write(path, bytes)
  }
  return log
}

/** The paths of `writes` that go to the asset pool. */
export const poolWrites = (writes: readonly string[]) =>
  writes.filter((path) => path.startsWith(POOL_FOLDER))
