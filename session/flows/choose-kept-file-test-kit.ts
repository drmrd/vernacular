import { vi } from 'vitest'
import type { DirectoryPort, DocumentStore, ProjectRecord } from '../../storage'
import { documentOfNewerVersion } from '../../tests/storage/conformance/conformance-documents'
import { REPLACED_PREFIX, SET_ASIDE_PREFIX } from '../../tests/storage/conformance/conformance-run'
import { DOCUMENT_FILE, placeDocument, recordOf } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import { SECOND_FILE_NAME, documentNamed, placeSecondFile } from '../handle/second-file-test-kit'
import type { SessionPorts } from '../ports'
import { reconcileIndex } from '../projects/reconcile-index'
import {
  openSecondFileAsNew,
  readTwoFiles,
  removeSecondFile,
  replaceWithSecondFile,
} from './choose-kept-file'
import type { KeptFileChoice, KeptFileResult } from './choose-kept-file'
import { PROJECT_ID, placeFolderProject } from './open-failed-test-kit'

/**
 * Test support: the project `a` with two document files, in the workspace and in a folder, the
 * choice between them as the dialog reads it, and the three flows that act on a choice.
 */

/** What a project with two readable files needs: a main file that is newer, or one that is readable. */
export type ProjectState = 'newer-main' | 'both-readable'

export const MAIN_NAME = 'Project of the main file'
export const SECOND_NAME = 'Project of the second file'

/** The name of the project that opening the second file as a new project makes. */
export const COPY_NAME = `${SECOND_NAME} (second plan file)`

/** Where the main file and the second file of the project `a` sit in the workspace. */
export const MAIN_PATH = `${PROJECT_ID}/${DOCUMENT_FILE}`
export const SECOND_PATH = `${PROJECT_ID}/${SECOND_FILE_NAME}`

/** The start of the name of a copy of a set-aside second file, and of a replaced main file. */
export { REPLACED_PREFIX, SET_ASIDE_PREFIX }

/** The bytes of the main file in `state`. */
export function mainBytesOf(state: ProjectState): Uint8Array {
  return state === 'newer-main' ? documentOfNewerVersion() : documentNamed(MAIN_NAME)
}

/** The bytes of a second file that this build reads. */
export function secondBytes(): Uint8Array {
  return documentNamed(SECOND_NAME)
}

/** Stores the project `a` in the workspace, with a record, as a project with two files in `state`. */
export async function storeProject(
  ports: TestPorts,
  state: ProjectState,
  second: Uint8Array = secondBytes(),
): Promise<void> {
  await placeDocument(ports, PROJECT_ID, mainBytesOf(state))
  await placeSecondFile(ports, PROJECT_ID, second)
  await reconcileIndex(ports)
}

/** Remembers a folder as the project `a`, with a record, as a project with two files in `state`. */
export async function storeFolderProject(
  ports: TestPorts,
  state: ProjectState,
): Promise<DirectoryPort> {
  const folder = await placeFolderProject(ports, mainBytesOf(state))
  await folder.writeFile(SECOND_FILE_NAME, secondBytes())
  return folder
}

/** What the record of the kit's project says about its second file; undefined when it says nothing. */
export async function recordedSecondFile(
  ports: TestPorts,
): Promise<ProjectRecord['secondFile'] | undefined> {
  return (await recordOf(ports, PROJECT_ID))?.secondFile
}

/** The two files of the kit's project as `readTwoFiles` gives them. Throws when it gives none. */
export async function choiceOf(ports: SessionPorts, open?: boolean): Promise<KeptFileChoice> {
  const read = await readTwoFiles(ports, PROJECT_ID)
  if (!read.ok || read.files === undefined) {
    throw new Error(`Expected a project with two files: ${JSON.stringify(read)}`)
  }
  return open === undefined
    ? { id: PROJECT_ID, files: read.files }
    : { id: PROJECT_ID, files: read.files, open }
}

/** The handle that a replace or remove flow gives. Throws, naming the result, when it gives none. */
export function keptHandleOf(result: KeptFileResult): DocumentHandle {
  if (!result.ok || result.handle === undefined) {
    throw new Error(`Expected a project to be open: ${JSON.stringify(result)}`)
  }
  return result.handle
}

/** The bytes of each copy in `copies` whose name starts with `prefix`. */
export function bytesOfCopies(
  copies: readonly { readonly name: string; readonly bytes: Uint8Array | undefined }[],
  prefix: string,
): (Uint8Array | undefined)[] {
  return copies.filter(({ name }) => name.startsWith(prefix)).map(({ bytes }) => bytes)
}

/**
 * From now on, the first request for a lock of the kit's ports finds it free, as the choice makes
 * it, and every request after the choice releases that hold finds another tab holding it, as the
 * open that follows the choice makes it.
 */
export function letAnotherTabTakeTheLockOnceTheChoiceFreesIt(ports: TestPorts): void {
  const tryAcquire = ports.locks.tryAcquire.bind(ports.locks)
  let freed = false
  vi.spyOn(ports.locks, 'tryAcquire').mockImplementation(async (id) => {
    const hold = freed ? undefined : await tryAcquire(id)
    if (hold === undefined) return undefined
    return {
      release: async () => {
        freed = true
        await hold.release()
      },
    }
  })
}

/** The three flows of a choice, with the store method that each one acts through. */
export const FLOWS = [
  {
    name: 'opening the second file as a new project',
    run: openSecondFileAsNew,
    storeMethod: 'readSecondFile',
  },
  {
    name: 'replacing the main file with the second file',
    run: replaceWithSecondFile,
    storeMethod: 'promoteSecondFile',
  },
  { name: 'removing the second file', run: removeSecondFile, storeMethod: 'setAsideSecondFile' },
] as const satisfies readonly {
  readonly name: string
  readonly run: unknown
  readonly storeMethod: keyof DocumentStore
}[]

/**
 * Makes the first record write of the kit's project that leaves out the second file fail, the write
 * that a choice makes once the files are settled. Every other record write goes through.
 */
export function failRecordWriteWithoutSecondFile(ports: TestPorts): void {
  const put = ports.index.put.bind(ports.index)
  let failed = false
  vi.spyOn(ports.index, 'put').mockImplementation(async (record) => {
    if (!failed && record.id === PROJECT_ID && record.secondFile === undefined) {
      failed = true
      throw new Error('The index is gone')
    }
    await put(record)
  })
}
