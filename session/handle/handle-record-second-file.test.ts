import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renameProject } from '../../core'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  documentOfNewerVersion,
} from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  recordOf,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import {
  SECOND_FILE_NAME,
  documentNamed,
  openBesideSecondFile,
  storeNewerMainBesideSecondFile,
} from './second-file-test-kit'

const PROJECT_ID = 'a'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** The one record of the index, after the writes that were started have ended. */
async function onlyRecord(ports: TestPorts) {
  await settle()
  const records = await ports.index.all()
  expect(records).toHaveLength(1)
  return records[0]
}

/** Changes the project and stores it, so the save runs against whatever the store holds. */
async function editAndSave(handle: DocumentHandle): Promise<void> {
  handle.session.dispatch(renameProject('An edit'))
  expect(await handle.save()).toEqual({ ok: true })
}

describe('the second file in the record that a handle writes', () => {
  it('an open that reads the second file records its name and that the second file was read', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, PROJECT_ID, documentNamed('In the second file'))

    await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect((await recordOf(ports, PROJECT_ID))?.secondFile).toEqual({
      name: SECOND_FILE_NAME,
      read: 'second',
    })
  })

  it('an open of the main file beside a second file records its name and that the main file was read', async () => {
    const ports = createTestPorts()
    await openBesideSecondFile(ports)

    expect((await onlyRecord(ports))?.secondFile).toEqual({ name: SECOND_FILE_NAME, read: 'main' })
  })

  it.each([
    ['no earlier record', undefined],
    [
      'an earlier record that has the field',
      sampleRecord({ id: PROJECT_ID, secondFile: { name: SECOND_FILE_NAME, read: 'second' } }),
    ],
  ])(
    'an open of a project with no second file writes no secondFile after %s',
    async (_case, earlier) => {
      const ports = createTestPorts()
      await placeDocument(ports, PROJECT_ID, currentBytes())
      if (earlier !== undefined) await ports.index.put(earlier)

      await openOrThrow(ports, workspaceRequest(PROJECT_ID))

      const record = await recordOf(ports, PROJECT_ID)
      expect(record).toBeDefined()
      expect(record).not.toHaveProperty('secondFile')
    },
  )

  it('the first save that writes the second file records its name and that the second file was read', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await placeDocument(ports, PROJECT_ID, documentOfNewerVersion())

    await editAndSave(handle)

    expect((await recordOf(ports, PROJECT_ID))?.secondFile).toEqual({
      name: SECOND_FILE_NAME,
      read: 'second',
    })
  })

  it('a save that writes the main file leaves the field of the record as the open wrote it', async () => {
    const ports = createTestPorts()
    const handle = await openBesideSecondFile(ports)
    const before = (await onlyRecord(ports))?.secondFile

    await editAndSave(handle)

    expect((await onlyRecord(ports))?.secondFile).toEqual(before)
  })
})
