// @vitest-environment node
// Reads the stored files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { secondDocumentFileName } from '../../storage'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { documentOfNewerVersion } from '../../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  recordOf,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import {
  documentNamed,
  storeNewerMainBesideSecondFile,
  storeTwoReadableFiles,
} from './second-file-test-kit'

const PROJECT_ID = 'a'
const MAIN_NAME = 'Project of the main file'
const SECOND_NAME = 'Project of the second file'
const EARLIER_FAILURE = { opened: false, build: 'an-older-build', reason: 'invalid-json' }

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Ports that hold the project `a` with two files this build reads, and a record of its last open. */
async function portsWithTwoReadableFiles(): Promise<TestPorts> {
  const ports = createTestPorts()
  await storeTwoReadableFiles(ports, PROJECT_ID, { main: MAIN_NAME, second: SECOND_NAME })
  await ports.index.put(sampleRecord({ id: PROJECT_ID, lastOpen: EARLIER_FAILURE }))
  return ports
}

describe('opening a project with two readable document files', () => {
  it('fails with the two files as the store reports them, and opens no handle', async () => {
    const ports = await portsWithTwoReadableFiles()
    const files = await ports.workspace.twoFiles(PROJECT_ID)

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(files).toMatchObject({ state: 'both-readable' })
    expect(failure).toEqual({ kind: 'two-files', files })
  })

  it('frees the lock and leaves both stored files as they were', async () => {
    const ports = await portsWithTwoReadableFiles()
    const before = await treeOf(ports.root)

    await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(await ports.locks.heldIds()).toEqual(new Set())
    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('does not note a failed open in the record', async () => {
    const ports = await portsWithTwoReadableFiles()
    const before = await recordOf(ports, PROJECT_ID)

    await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(await recordOf(ports, PROJECT_ID)).toEqual(before)
  })

  it('opens the main file, keeping both files, when the request says so', async () => {
    const ports = await portsWithTwoReadableFiles()

    const handle = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      keepBothFiles: true,
    })

    expect(handle.session.getProject().meta.name).toBe(MAIN_NAME)
    expect(
      await ports.root.readFile(`${PROJECT_ID}/${secondDocumentFileName(CURRENT_SCHEMA_VERSION)}`),
    ).toEqual(documentNamed(SECOND_NAME))
    await handle.close()
  })
})

describe('opening a project whose second file does not ask for a choice', () => {
  it('opens from the second file, without asking, when the main file is newer', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, PROJECT_ID, documentNamed(SECOND_NAME))

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(handle.session.getProject().meta.name).toBe(SECOND_NAME)
    await handle.close()
  })

  it('opens the main file, without asking, when the only second file is above the version of this build', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentNamed(MAIN_NAME))
    await ports.root.writeFile(
      `${PROJECT_ID}/${secondDocumentFileName(CURRENT_SCHEMA_VERSION + 1)}`,
      documentOfNewerVersion(),
    )

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(handle.session.getProject().meta.name).toBe(MAIN_NAME)
    await handle.close()
  })
})
