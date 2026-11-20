import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { placeDocument } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import { notJsonBytes, placeSound, rebuildPorts, soundRecordOf } from './rebuild-test-kit'

/** A function that throws `error` at once, with no promise. */
function throwing(error: Error): () => never {
  return () => {
    throw error
  }
}

/** Each call of a port that the run makes, and how a test makes it throw `error` at once. */
const PORT_CALLS_THAT_THROW: readonly (readonly [
  string,
  (ports: TestPorts, error: Error) => Promise<unknown>,
])[] = [
  [
    'the read of the index',
    async (ports, error) => vi.spyOn(ports.index, 'all').mockImplementation(throwing(error)),
  ],
  [
    'the listing of the store',
    async (ports, error) => vi.spyOn(ports.workspace, 'list').mockImplementation(throwing(error)),
  ],
  [
    'the read of a project',
    async (ports, error) => vi.spyOn(ports.workspace, 'read').mockImplementation(throwing(error)),
  ],
  [
    'the stored files of a document that does not decode',
    async (ports, error) => {
      await placeDocument(ports, 'broken', notJsonBytes())
      return vi.spyOn(ports.workspace, 'storedFiles').mockImplementation(throwing(error))
    },
  ],
  [
    'the put of a record',
    async (ports, error) => vi.spyOn(ports.index, 'put').mockImplementation(throwing(error)),
  ],
  [
    'the remove of a record whose project is gone',
    async (ports, error) => {
      await ports.index.put(sampleRecord({ id: 'gone' }))
      return vi.spyOn(ports.index, 'remove').mockImplementation(throwing(error))
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

/** Exactly one warning, which holds `count` as a number and `error` itself. */
function expectOneWarning(count: number, error: Error): void {
  expect(consoleWarn).toHaveBeenCalledTimes(1)
  const [args = []] = consoleWarn.mock.calls
  expect(args).toContain(count)
  expect(args).toContain(error)
}

describe('the count of failed steps in the one warning of a run', () => {
  it('a read of the index that rejects while the puts work counts one, with its error, and every record is put', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const error = new Error('the index cannot be read')
    vi.spyOn(ports.index, 'all').mockRejectedValueOnce(error)
    const records = [soundRecordOf('a'), soundRecordOf('b')]

    expect(await reconcileIndex(ports)).toEqual(records)

    expect(await ports.index.all()).toEqual(records)
    expectOneWarning(1, error)
  })

  it('a read of the index and a listing that both reject count two, with the error of the index first, and give an empty list', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const indexError = new Error('the index cannot be read')
    const listError = new Error('the workspace cannot be listed')
    vi.spyOn(ports.index, 'all').mockRejectedValue(indexError)
    vi.spyOn(ports.workspace, 'list').mockRejectedValue(listError)

    expect(await reconcileIndex(ports)).toEqual([])

    expectOneWarning(2, indexError)
    expect(consoleWarn.mock.calls[0]).not.toContain(listError)
  })

  it('two removes that reject count two', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(sampleRecord({ id: 'gone' }))
    await ports.index.put(sampleRecord({ id: 'lost' }))
    const error = new Error('the index is locked')
    vi.spyOn(ports.index, 'remove').mockRejectedValue(error)

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])

    expectOneWarning(2, error)
  })

  it.each(PORT_CALLS_THAT_THROW)(
    'when %s throws at once in place of rejecting, the run still resolves and counts one, with that error',
    async (_call, throwFrom) => {
      const ports = rebuildPorts()
      await placeSound(ports, ['a'])
      const error = new Error('this call throws at once')
      await throwFrom(ports, error)

      await expect(reconcileIndex(ports)).resolves.toEqual(expect.any(Array))

      expectOneWarning(1, error)
    },
  )
})
