import { encodeDocument } from '../../core'
import {
  documentOfNewerVersion,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import { SECOND_FILE_NAME } from '../../tests/storage/conformance/conformance-run'
import { placeDocument } from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

/** Test support: stored projects that hold a second document file beside the main file. */

export { SECOND_FILE_NAME }

/** The bytes of a sound document of the current version, as this build writes it, under `name`. */
export function documentNamed(name: string): Uint8Array {
  return encodeDocument(renamed(soundProject(), name), undefined).bytes
}

/** Stores `bytes` as the second document file of the project `id` in the workspace of `ports`. */
export function placeSecondFile(ports: TestPorts, id: string, bytes: Uint8Array): Promise<void> {
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
