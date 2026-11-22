// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { secondDocumentFileVersion } from '../../storage'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import { createTestPorts, openOrThrow, workspaceRequest } from '../handle/handle-test-kit'
import {
  SECOND_FILE_NAME,
  documentNamed,
  storeNewerMainBesideSecondFile,
  storeTwoReadableFiles,
} from '../handle/second-file-test-kit'
import { filesOfArchive, projectOfArchive, storedBytesOf } from './card-flows-test-kit'
import { exportProject } from './export-project'
import type { ExportProjectResult } from './export-project'

const ID = 'beside-a-second-file'
const MAIN_NAME = 'Name in the main file'
const SECOND_NAME = 'Name in the second file'

/** The archive of a result that must hold an ordinary archive. */
function archiveOf(result: ExportProjectResult) {
  if (!result.ok || result.kind !== 'archive') {
    throw new Error(`Expected an archive, got ${result.ok ? result.kind : result.failure.kind}`)
  }
  return result
}

/** The unchecked copy of a result that must hold one. */
function uncheckedCopyOf(result: ExportProjectResult) {
  if (!result.ok || result.kind !== 'unchecked-copy') {
    throw new Error(
      `Expected an unchecked copy, got ${result.ok ? result.kind : result.failure.kind}`,
    )
  }
  return result
}

/** The paths of an archive that name a second document file. */
function secondFilePathsOf(archive: Uint8Array): string[] {
  return [...filesOfArchive(archive).keys()].filter(
    (path) => secondDocumentFileVersion(path) !== undefined,
  )
}

describe('an export of a project that holds a second document file', () => {
  it('a project that did not open exports an unchecked copy that holds both files byte for byte', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, ID, documentBreakingFormatRules())
    const [stored] = [...(await storedBytesOf(ports, [ID])).values()]

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: ID }))

    const files = filesOfArchive(copy.bytes)
    expect(files.get(SECOND_FILE_NAME)).toEqual(documentBreakingFormatRules())
    expect(files).toEqual(stored)
  })

  it('a closed project beside a newer main file exports the second file as vernacular.json and no second file', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, ID, documentNamed(SECOND_NAME))
    const before = await storedBytesOf(ports, [ID])

    const { bytes } = archiveOf(await exportProject(ports, undefined, { id: ID }))

    expect((await projectOfArchive(bytes)).meta.name).toBe(SECOND_NAME)
    expect(secondFilePathsOf(bytes)).toEqual([])
    expect(await storedBytesOf(ports, [ID])).toEqual(before)
  })

  it('a closed project with two readable files exports the document of the main file and no second file', async () => {
    const ports = createTestPorts()
    await storeTwoReadableFiles(ports, ID, { main: MAIN_NAME, second: SECOND_NAME })

    const { bytes } = archiveOf(await exportProject(ports, undefined, { id: ID }))

    expect((await projectOfArchive(bytes)).meta.name).toBe(MAIN_NAME)
    expect(secondFilePathsOf(bytes)).toEqual([])
  })

  it('the open project that was read from its second file exports its document as vernacular.json', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, ID, documentNamed(SECOND_NAME))
    const handle = await openOrThrow(ports, workspaceRequest(ID))

    const { bytes } = archiveOf(await exportProject(ports, handle, { id: ID }))

    expect((await projectOfArchive(bytes)).meta.name).toBe(SECOND_NAME)
    expect(secondFilePathsOf(bytes)).toEqual([])
    await handle.close()
  })
})
