import { documentOfNewerVersion } from '../../tests/storage/conformance/conformance-documents'
import { SECOND_FILE_NAME } from '../../tests/storage/conformance/conformance-run'
import { documentNamed } from '../projects/rebuild-test-kit'
import { openOrThrow, placeDocument, workspaceRequest } from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import type { DocumentHandle } from './handle-types'

/** Test support: stored projects that hold a second document file beside the main file. */

export { SECOND_FILE_NAME, documentNamed }

/** Stores `bytes` as the second document file of the project `id` in the workspace of `ports`. */
function placeSecondFile(ports: TestPorts, id: string, bytes: Uint8Array): Promise<void> {
  return ports.root.writeFile(`${id}/${SECOND_FILE_NAME}`, bytes)
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
