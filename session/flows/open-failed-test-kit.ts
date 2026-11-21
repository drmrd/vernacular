import { withMixedPaintEntries, withoutRequiredField } from '../../core/repairs/repairs-test-kit'
import type { DirectoryPort } from '../../storage'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { bytesOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import { IN_FOLDER, placeDocument, rememberFolder } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { OpenRequest } from '../handle/handle-types'

/**
 * Test support: projects that break the format rules, in the workspace and in a folder, and a copy
 * of every file of a project's directory for a comparison byte for byte.
 */

export const PROJECT_ID = 'a'

/** The sentence that the repair of two mixed paint entries gives. */
export const TWO_PAINT_ENTRIES_SENTENCE = 'It removes the extra data from 2 paint entries.'

/** The directory of the backups of a project, below its directory. */
export const BACKUP_FOLDER = '.house-backups'

/** The document of the current version in which two paint entries carry the fields of another kind. */
export function mixedPaintBytes(): Uint8Array {
  return bytesOf(withMixedPaintEntries())
}

/** The document of the current version whose first floor has no walls, a field that the format requires. */
export function missingRequiredFieldBytes(): Uint8Array {
  return bytesOf(withoutRequiredField())
}

/** Stores `bytes` as the document of the project `a` in the workspace. */
export function placeInWorkspace(ports: TestPorts, bytes: Uint8Array): Promise<void> {
  return placeDocument(ports, PROJECT_ID, bytes)
}

/** Remembers a folder as the project `a`, with `bytes` as its document. Gives the folder's directory. */
export function placeInFolder(ports: TestPorts, bytes: Uint8Array) {
  return rememberFolder(ports, PROJECT_ID, bytes)
}

/** The request to open the project `a` from the folder that `placeInFolder` remembered. */
export function folderRequest(): OpenRequest {
  return { id: PROJECT_ID, location: IN_FOLDER }
}

/** Every file under `prefix` of `root`, keyed by its path, with its bytes. */
export function filesOf(root: DirectoryPort, prefix = ''): Promise<Record<string, number[]>> {
  return treeOf(root, prefix)
}
