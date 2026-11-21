import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import { placeDocument } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import { recordOfOpened } from './project-facts'
import {
  EARLIER_CHANGE,
  STORED_AT,
  USED_AT,
  documentOfNewerVersion,
  documentWithoutFloors,
  failedRecord,
  folderRecord,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  stepWarnings,
  unreadRecordOf,
} from './rebuild-test-kit'

vi.mock('./project-facts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./project-facts')>()
  return { ...actual, recordOfOpened: vi.fn(actual.recordOfOpened) }
})

let consoleWarn: MockInstance<typeof console.warn>

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** The next record of an opened document cannot be built: its build throws once. */
function failNextRecordBuild(): void {
  vi.mocked(recordOfOpened).mockImplementationOnce(() => {
    throw new Error('the record cannot be built')
  })
}

describe('records that the next call makes again', () => {
  it('a document with no floors whose stored files cannot be read is not put and counts one failed step, and the next call puts its record with its name', async () => {
    const ports = rebuildPorts()
    const bytes = documentWithoutFloors('A plan with no floors')
    await placeDocument(ports, 'a', bytes)
    const error = new Error('the stored files cannot be read')
    vi.spyOn(ports.workspace, 'storedFiles').mockRejectedValueOnce(error)
    const put = vi.spyOn(ports.index, 'put')
    const found = failedRecord('a', bytes, 'format-rules')

    expect(await reconcileIndex(ports)).toEqual([{ ...found, name: undefined, assetHashes: [] }])
    expect(put).not.toHaveBeenCalled()
    const warnings = stepWarnings(consoleWarn.mock.calls)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(1)
    expect(warnings[0]).toContain(error)

    expect(await reconcileIndex(ports)).toEqual([found])
    expect(await ports.index.get('a')).toEqual(found)
    expect(found.name).toBe('A plan with no floors')
  })

  it('stored files that hold no document file give a record with no name that is put, and once the project is deleted the next call drops it', async () => {
    const ports = rebuildPorts()
    const bytes = documentOfNewerVersion('Drawn by a later release')
    await placeDocument(ports, 'later', bytes)
    vi.spyOn(ports.workspace, 'storedFiles').mockResolvedValueOnce(new Map())
    const nameless = {
      ...failedRecord('later', bytes, 'newer-version'),
      name: undefined,
      assetHashes: [],
    }

    expect(await reconcileIndex(ports)).toEqual([nameless])
    expect(await ports.index.get('later')).toEqual(nameless)
    await ports.workspace.delete('later')

    expect(await reconcileIndex(ports)).toEqual([])
    expect(await ports.index.get('later')).toBeUndefined()
  })

  it('a failed read under a folder record gives the placeholder, and the next read that works puts the rebuilt record in place of the folder record', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(folderRecord('a'))
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('the store cannot be read'))

    expect(await reconcileIndex(ports)).toEqual([unreadRecordOf('a')])

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])
    expect(await ports.index.get('a')).toEqual(soundRecordOf('a'))
  })
})

describe('a sound read whose record cannot be built', () => {
  it('keeps the earlier workspace record, puts nothing, and does not warn', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const earlier = sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE })
    await ports.index.put(earlier)
    const put = vi.spyOn(ports.index, 'put')
    failNextRecordBuild()

    expect(await reconcileIndex(ports)).toEqual([earlier])

    expect(put).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('with no earlier record gives the placeholder, puts nothing, and does not warn', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const put = vi.spyOn(ports.index, 'put')
    failNextRecordBuild()

    expect(await reconcileIndex(ports)).toEqual([unreadRecordOf('a')])

    expect(put).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })
})

describe('the times of a record that replaces an earlier one', () => {
  it('a document with no floors keeps the time of use of the earlier workspace record', async () => {
    const ports = rebuildPorts()
    const bytes = documentWithoutFloors('A plan with no floors')
    await placeDocument(ports, 'a', bytes)
    await ports.index.put(
      sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE, lastUsedAt: USED_AT }),
    )

    const expected = { ...failedRecord('a', bytes, 'format-rules'), lastUsedAt: USED_AT }
    expect(await reconcileIndex(ports)).toEqual([expected])
    expect(await ports.index.get('a')).toEqual(expected)
  })

  it('a document that fails only the strict check takes the listed time, not the time of change of the record that it replaces', async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'a', documentBreakingFormatRules())
    await ports.index.put(
      sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE, lastUsedAt: USED_AT }),
    )

    const [record] = await reconcileIndex(ports)

    expect([record?.lastChangedAt, record?.lastUsedAt]).toEqual([STORED_AT, USED_AT])
    expect((await ports.index.get('a'))?.lastChangedAt).toBe(STORED_AT)
  })

  it('a workspace record with no time of use is rebuilt with the new time of change as its time of use', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(
      sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE, lastUsedAt: undefined }),
    )

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])
    expect(soundRecordOf('a').lastUsedAt).toBe(STORED_AT)
  })
})
