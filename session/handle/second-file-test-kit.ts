import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../core'
import { projectReferring } from '../../storage/zip/zip-test-kit'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { documentOfNewerVersion } from '../../tests/storage/conformance/conformance-documents'
import { SECOND_FILE_NAME } from '../../tests/storage/conformance/conformance-run'
import { documentNamed } from '../projects/rebuild-test-kit'
import { openOrThrow, placeDocument, workspaceRequest, type TestPorts } from './handle-test-kit'
import type { DocumentHandle } from './handle-types'

/** Test support: stored projects that hold a second document file beside the main file. */

export { SECOND_FILE_NAME, documentNamed }

/** Stores `bytes` as the second document file of the project `id` in the workspace of `ports`. */
export function placeSecondFile(ports: TestPorts, id: string, bytes: Uint8Array): Promise<void> {
  return ports.root.writeFile(`${id}/${SECOND_FILE_NAME}`, bytes)
}

/** The stored bytes of a document of this build that places a piece of furniture for each content hash. */
export function documentReferring(contentHashes: readonly string[]): Uint8Array {
  const references = contentHashes.map((contentHash) => ({ scope: 'user' as const, contentHash }))
  return encodeDocument(projectReferring(references), undefined).bytes
}

/** The stored bytes of a document that a newer build wrote, with a piece of furniture that uses `contentHash`. */
export function documentOfNewerVersionReferring(contentHash: string): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
  const floors = document.floors as { furniture: unknown[] }[]
  floors[0]?.furniture.push({
    id: 'piece-of-a-newer-build',
    assetRef: { scope: 'user', contentHash },
  })
  return bytesOf(document)
}

/** Stores a main file that a newer build wrote, beside the second file `secondBytes`. */
export async function storeNewerMainBesideSecondFile(
  ports: TestPorts,
  id: string,
  secondBytes: Uint8Array,
): Promise<void> {
  await placeDocument(ports, id, documentOfNewerVersion())
  await placeSecondFile(ports, id, secondBytes)
}

/** Stores a main file and a second file that this build reads, each under its own project name. */
export async function storeTwoReadableFiles(
  ports: TestPorts,
  id: string,
  names: { readonly main: string; readonly second: string },
): Promise<void> {
  await placeDocument(ports, id, documentNamed(names.main))
  await placeSecondFile(ports, id, documentNamed(names.second))
}

/** Opens a project whose main file this build reads, beside a second document file. */
export async function openBesideSecondFile(ports: TestPorts): Promise<DocumentHandle> {
  const id = 'beside-a-second-file'
  await storeTwoReadableFiles(ports, id, { main: 'Main file', second: 'Second file' })
  return openOrThrow(ports, workspaceRequest(id))
}
