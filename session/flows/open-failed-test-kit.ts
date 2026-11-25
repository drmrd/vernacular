import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { Project, RepairOffer } from '../../core'
import {
  firstFloorOf,
  soundDocument,
  withMixedPaintEntries,
  withUndefinedFields,
  withoutRequiredField,
} from '../../core/repairs/repairs-test-kit'
import type { DirectoryPort } from '../../storage'
import { assetEntry, buildZip, contentHashOf, documentEntry } from '../../storage/zip/zip-test-kit'
import { bytesOf, projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  DOCUMENT_FILE,
  IN_FOLDER,
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  rememberFolder,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle, OpenRequest } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import { folderRecord } from '../projects/rebuild-test-kit'
import { IMAGE } from './import-file-test-kit'

/**
 * Test support: projects that break the format rules, in the workspace and in a folder, and a copy
 * of every file of a project's directory for a comparison byte for byte.
 */

export const PROJECT_ID = 'a'
export const OTHER_ID = 'b'
export const EDITED_NAME = 'Edited just before the choice'

/** The name of the project that breaks the format rules, and the name of its repaired copy. */
export const STORED_NAME = 'Alder Street Cottage'
export const REPAIRED_NAME = `${STORED_NAME} (repaired copy)`

/** The sentence that the repair of two mixed paint entries gives. */
export const TWO_PAINT_ENTRIES_SENTENCE = 'It removes the extra data from 2 paint entries.'

/** The directory of the backups of a project, below its directory. */
export const BACKUP_FOLDER = '.house-backups'

/** The start of the name of the backup that a replace keeps of the stored bytes. */
export const PRE_REPAIR_PREFIX = `pre-repair-v${CURRENT_SCHEMA_VERSION}-`

/** The document of the current version in which two paint entries carry the fields of another kind. */
export function mixedPaintBytes(): Uint8Array {
  return bytesOf(withMixedPaintEntries())
}

/** The document of the current version that breaks no rule: what the repair of the mixed one gives. */
export function soundBytes(): Uint8Array {
  return bytesOf(soundDocument())
}

/** A document whose repair removes other pointers than the repair of `mixedPaintBytes`. */
export function otherRepairBytes(): Uint8Array {
  return bytesOf(withUndefinedFields(withMixedPaintEntries()))
}

/** The document of the current version whose first floor has no walls, a field that the format requires. */
export function missingRequiredFieldBytes(): Uint8Array {
  return bytesOf(withoutRequiredField())
}

/** The project without its meta, for a comparison of everything that a name or a save does not touch. */
export function withoutMeta(project: Project): unknown {
  return { ...project, meta: undefined }
}

/** What the repair of `mixedPaintBytes` must give, without its meta. */
export function repairedBody(): unknown {
  return withoutMeta(projectOf(soundBytes()))
}

/**
 * The mixed document with its first underlay image replaced by `image`, as bytes, with the hash
 * of `image`. The reference has the asset scope `scope` when one is given.
 */
export async function mixedPaintReferringTo(
  image: Uint8Array,
  scope?: string,
): Promise<{ readonly bytes: Uint8Array; readonly imageHash: string }> {
  const imageHash = await contentHashOf(image)
  const document = withMixedPaintEntries()
  const underlay = (firstFloorOf(document).underlays as Json[])[0]
  if (underlay === undefined) throw new Error('The document has no underlay')
  const reference = (underlay.source as { image: { contentHash: string; scope: string } }).image
  reference.contentHash = imageHash
  if (scope !== undefined) reference.scope = scope
  return { bytes: bytesOf(document), imageHash }
}

/** The .building archive of the mixed document, with the bytes of the image that it refers to. */
export async function mixedPaintArchive(): Promise<{
  readonly bytes: Uint8Array
  readonly imageHash: string
}> {
  const { bytes, imageHash } = await mixedPaintReferringTo(IMAGE)
  return { bytes: buildZip([documentEntry(bytes), await assetEntry(IMAGE)]), imageHash }
}

/** Stores `bytes` as the document of the project `a` in the workspace. */
export function placeInWorkspace(ports: TestPorts, bytes: Uint8Array): Promise<void> {
  return placeDocument(ports, PROJECT_ID, bytes)
}

/** Remembers a folder as the project `a`, with `bytes` as its document. Gives the folder's directory. */
export function placeInFolder(
  ports: TestPorts,
  bytes: Uint8Array,
): ReturnType<typeof rememberFolder> {
  return rememberFolder(ports, PROJECT_ID, bytes)
}

/**
 * Remembers a folder as the project `a`, with `bytes` as its document and a record in the index
 * that names the folder. Gives the folder's directory.
 */
export async function placeFolderProject(
  ports: TestPorts,
  bytes: Uint8Array,
): Promise<DirectoryPort> {
  const folder = await placeInFolder(ports, bytes)
  await ports.index.put(folderRecord(PROJECT_ID, { location: IN_FOLDER }))
  return folder
}

/**
 * Remembers a folder as the project `a`, with a record in the index that names the folder. Its
 * mixed document refers to the image `IMAGE`, which the folder does not hold yet, with the asset
 * scope `scope` when one is given.
 */
export async function placeFolderProjectReferringToImage(
  ports: TestPorts,
  scope?: string,
): Promise<{ readonly folder: DirectoryPort; readonly imageHash: string }> {
  const { bytes, imageHash } = await mixedPaintReferringTo(IMAGE, scope)
  return { folder: await placeFolderProject(ports, bytes), imageHash }
}

/** The request to open the project `a` from the folder that `placeInFolder` remembered. */
export function folderRequest(): OpenRequest {
  return { id: PROJECT_ID, location: IN_FOLDER }
}

/** The repair that the refused open of `request` carries. Throws when the open gives no repair. */
export async function offerOf(ports: SessionPorts, request: OpenRequest): Promise<RepairOffer> {
  const failure = await failureOf(ports, request)
  if (failure.kind !== 'did-not-open' || failure.repair === undefined) {
    throw new Error(`Expected a failure with a repair: ${JSON.stringify(failure)}`)
  }
  return failure.repair
}

/** The request to open the repaired project `a` as a new project. */
export function repairedCopyRequest(offer: RepairOffer) {
  return { id: PROJECT_ID, offer }
}

/** The request to replace the stored project `a` with the repair that the user saw. */
export function replaceRequest(offer: RepairOffer) {
  return { id: PROJECT_ID, removedPaths: offer.removedPaths }
}

/** Stores the sound project `b` and opens it, as the current project. */
export async function openAnotherProject(ports: TestPorts): Promise<DocumentHandle> {
  await placeDocument(ports, OTHER_ID, currentBytes())
  return openOrThrow(ports, { id: OTHER_ID, location: { kind: 'workspace' } })
}

/** The ids of the projects that the workspace lists. */
export async function storedIds(ports: TestPorts): Promise<string[]> {
  return (await ports.workspace.list()).map((summary) => summary.id)
}

/** The stored document bytes of the project `a` in the workspace. */
export function storedBytes(ports: TestPorts): Promise<Uint8Array | undefined> {
  return ports.root.readFile(`${PROJECT_ID}/${DOCUMENT_FILE}`)
}

/** Each file of `directory`, with its name and bytes. */
async function filesIn(
  root: DirectoryPort,
  directory: string,
): Promise<{ name: string; bytes: Uint8Array | undefined }[]> {
  const names = await root.list(directory)
  return Promise.all(
    names.map(async (name) => ({ name, bytes: await root.readFile(`${directory}/${name}`) })),
  )
}

/** The backups of the project `a` in the workspace. */
export function workspaceBackups(ports: TestPorts) {
  return filesIn(ports.root, `${PROJECT_ID}/${BACKUP_FOLDER}`)
}

/** The backups that a folder holds. */
export function folderBackups(folder: DirectoryPort) {
  return filesIn(folder, BACKUP_FOLDER)
}

/** Takes the lock of the project `a` for another tab of the same browser, and keeps it. */
export async function holdFromAnotherTab(ports: TestPorts): Promise<void> {
  const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
  const hold = await otherTab.locks.tryAcquire(PROJECT_ID)
  if (hold === undefined) throw new Error('The lock of the project was held already')
}
