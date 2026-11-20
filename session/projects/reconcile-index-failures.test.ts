import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ProjectRecord, StoreRead } from '../../storage'
import { failingIndex, sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { UNKNOWN_WALL_FIELD_PATH } from '../../tests/fixtures/projects/versions/fixture-documents'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import { placeDocument } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  EARLIER_CHANGE,
  documentOfNewerVersion,
  documentWithoutFloors,
  failReadsOf,
  failedRecord,
  folderRecord,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  stepWarnings,
  unreadRecordOf,
} from './rebuild-test-kit'

/** The two ways a read can give no document for a listed id although the store listed it. */
const READS_WITHOUT_A_DOCUMENT: readonly (readonly [string, () => Promise<StoreRead>])[] = [
  ['rejects', () => Promise.reject(new Error('the store cannot be read'))],
  ['answers not-found', () => Promise.resolve({ ok: false, failure: { kind: 'not-found' } })],
]

/** One step of a run that rejects alone, and how a test makes it reject with `error`. */
const SINGLE_FAILED_STEPS: readonly (readonly [
  string,
  (ports: TestPorts, error: Error) => Promise<unknown>,
])[] = [
  [
    'the remove of a record whose project is gone',
    async (ports, error) => {
      await ports.index.put(sampleRecord({ id: 'gone' }))
      return vi.spyOn(ports.index, 'remove').mockRejectedValue(error)
    },
  ],
  [
    'the listing of the store',
    async (ports, error) => vi.spyOn(ports.workspace, 'list').mockRejectedValue(error),
  ],
  [
    'the stored files of a document that does not decode',
    async (ports, error) => {
      await placeDocument(ports, 'broken', notJsonBytes())
      return vi.spyOn(ports.workspace, 'storedFiles').mockRejectedValue(error)
    },
  ],
]

let consoleWarn: MockInstance<typeof console.warn>

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Exactly one warning, which holds a text, `count` as a number, and `error` itself. */
function expectOneWarning(count: number, error: Error): void {
  expect(consoleWarn).toHaveBeenCalledTimes(1)
  const [args = []] = consoleWarn.mock.calls
  expect(args).toContain(count)
  expect(args).toContain(error)
  expect(args.some((arg) => typeof arg === 'string')).toBe(true)
}

/** From now on each `put` of the record of `id` rejects with `error`; the others are stored. */
function failPutsOf(ports: TestPorts, id: string, error: Error): void {
  const realPut = ports.index.put.bind(ports.index)
  ports.index.put = (record: ProjectRecord) =>
    record.id === id ? Promise.reject(error) : realPut(record)
}

describe('a folder record over a failed read, a document with no facts, and unreadable files', () => {
  it.each(READS_WITHOUT_A_DOCUMENT)(
    'a folder record under a listed id whose read %s gives way to the placeholder in the result, stays in the index, and the next call reads the project again',
    async (_way, failedRead) => {
      const ports = rebuildPorts()
      await placeSound(ports, ['a'])
      const away = folderRecord('a')
      await ports.index.put(away)
      const read = vi.spyOn(ports.workspace, 'read').mockImplementation(failedRead)
      const put = vi.spyOn(ports.index, 'put')

      expect(await reconcileIndex(ports)).toEqual([unreadRecordOf('a')])

      expect(put).not.toHaveBeenCalled()
      expect(await ports.index.get('a')).toEqual(away)
      await reconcileIndex(ports)
      expect(read.mock.calls).toEqual([['a'], ['a']])
    },
  )

  it('a document that fails only the strict check and whose facts cannot be built gets the record of a document that did not open, with the reason format-rules, and the index keeps it', async () => {
    const ports = rebuildPorts()
    const bytes = documentWithoutFloors('A plan with no floors')
    await placeDocument(ports, 'a', bytes)
    const expected = failedRecord('a', bytes, 'format-rules')
    expect(expected.name).toBe('A plan with no floors')

    expect(await reconcileIndex(ports)).toEqual([expected])

    expect(await ports.index.get('a')).toEqual(expected)
    const read = vi.spyOn(ports.workspace, 'read')
    expect(await reconcileIndex(ports)).toEqual([expected])
    expect(read).not.toHaveBeenCalled()
    expect(stepWarnings(consoleWarn.mock.calls)).toEqual([])
  })

  it('a document that does not decode and whose stored files cannot be read gets a record with no name that the index does not get, and the next call finds the name and puts it', async () => {
    const ports = rebuildPorts()
    const bytes = documentOfNewerVersion('Drawn by a later release')
    await placeDocument(ports, 'later', bytes)
    const files = vi.spyOn(ports.workspace, 'storedFiles').mockRejectedValue(new Error('no files'))
    const put = vi.spyOn(ports.index, 'put')
    const found = failedRecord('later', bytes, 'newer-version')

    const first = await reconcileIndex(ports)

    expect(first).toEqual([{ ...found, name: undefined, assetHashes: [] }])
    expect(put).not.toHaveBeenCalled()
    expect(await ports.index.get('later')).toBeUndefined()
    files.mockRestore()
    expect(await reconcileIndex(ports)).toEqual([found])
    expect(await ports.index.get('later')).toEqual(found)
  })
})

describe('one warning for a run with failed steps', () => {
  it('a store whose every read rejects with one error warns once, with that error and the count of the failed reads', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b', 'c'])
    const error = new Error('the store cannot be read')
    failReadsOf(ports, ['a', 'b', 'c'], error)

    await reconcileIndex(ports)

    expectOneWarning(3, error)
  })

  it('an index with no fall-back that rejects every call warns once, with its error and a count of the read of the index and the two puts', async () => {
    const error = new Error('the index refuses every call')
    const ports = rebuildPorts({ index: failingIndex(error) })
    await placeSound(ports, ['a', 'b'])

    await reconcileIndex(ports)

    expectOneWarning(3, error)
  })

  it('a put that rejects for one of three projects warns once, with the count 1 and its error', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b', 'c'])
    const error = new Error('the index is full')
    failPutsOf(ports, 'b', error)

    await reconcileIndex(ports)

    expectOneWarning(1, error)
  })

  it.each(SINGLE_FAILED_STEPS)(
    'a run in which only %s rejects warns once, with the count 1 and its error',
    async (_step, failStep) => {
      const ports = rebuildPorts()
      await placeSound(ports, ['a'])
      const error = new Error('this one step fails')
      await failStep(ports, error)

      await reconcileIndex(ports)

      expectOneWarning(1, error)
    },
  )

  it('with a failed read and a failed put in one run, the one warning holds the count 2 and the error of the read, which failed first', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const readError = new Error('the read of a fails')
    const putError = new Error('the put of b fails')
    // The listing is ordered by id and the projects are rebuilt one after the other, so the read
    // of a fails before b is read and put.
    failReadsOf(ports, ['a'], readError)
    failPutsOf(ports, 'b', putError)

    await reconcileIndex(ports)

    expectOneWarning(2, readError)
    expect(consoleWarn.mock.calls[0]).not.toContain(putError)
  })

  it('a console that cannot warn changes nothing: the run gives the same list', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    failReadsOf(ports, ['a'], new Error('the read of a fails'))
    consoleWarn.mockImplementation(() => {
      throw new Error('the console is closed')
    })

    await expect(reconcileIndex(ports)).resolves.toEqual([unreadRecordOf('a'), soundRecordOf('b')])
    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })

  it('two calls that overlap with a failed read give one warning in all', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const error = new Error('the read of a fails')
    failReadsOf(ports, ['a'], error)

    await Promise.all([reconcileIndex(ports), reconcileIndex(ports)])

    expectOneWarning(1, error)
  })
})

describe('runs whose steps all answer', () => {
  it('a run with no failed step does not warn: sound documents, a document that is not JSON, one of a newer version, and a read that answers not-found under a workspace record', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'kept'])
    await placeDocument(ports, 'broken', notJsonBytes())
    await placeDocument(ports, 'later', documentOfNewerVersion('Drawn by a later release'))
    await ports.index.put(sampleRecord({ id: 'kept', lastChangedAt: EARLIER_CHANGE }))
    const realRead = ports.workspace.read.bind(ports.workspace)
    const notFound: StoreRead = { ok: false, failure: { kind: 'not-found' } }
    vi.spyOn(ports.workspace, 'read').mockImplementation((id) =>
      id === 'kept' ? Promise.resolve(notFound) : realRead(id),
    )

    expect(await reconcileIndex(ports)).toHaveLength(4)

    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it("a document that fails only the strict check gives the store's warning with its faults, and no warning that counts failed steps", async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'a', documentBreakingFormatRules())

    await reconcileIndex(ports)

    expect(JSON.stringify(consoleWarn.mock.calls)).toContain(UNKNOWN_WALL_FIELD_PATH)
    expect(stepWarnings(consoleWarn.mock.calls)).toEqual([])
  })

  it('a read that rejects under a workspace record keeps the record, puts nothing, and warns once with its error', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['kept'])
    const kept = sampleRecord({ id: 'kept', lastChangedAt: EARLIER_CHANGE })
    await ports.index.put(kept)
    const error = new Error('the read of kept fails')
    failReadsOf(ports, ['kept'], error)
    const put = vi.spyOn(ports.index, 'put')

    expect(await reconcileIndex(ports)).toEqual([kept])

    expect(put).not.toHaveBeenCalled()
    expectOneWarning(1, error)
  })
})
