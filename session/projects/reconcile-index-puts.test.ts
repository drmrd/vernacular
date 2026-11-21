import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { InMemoryProjectIndex, withMemoryFallback } from '../../storage'
import {
  holdWrites,
  sampleRecord,
  watch,
} from '../../storage/project-index/project-record-test-kit'
import { INDEX_WRITE_WAIT_MS } from '../../storage/project-index/with-memory-fallback'
import { placeDocument } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  EARLIER_CHANGE,
  STORED_AT,
  holdPutOf,
  idsOf,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  stallPuts,
  trackReadsInFlight,
} from './rebuild-test-kit'

const FIVE_IDS = ['a', 'b', 'c', 'd', 'e']
const THREE_IDS = ['a', 'b', 'c']
const PENDING = { status: 'pending' }
const READ_TIME_MS = 1_000

let consoleWarn: MockInstance<typeof console.warn>

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Lets every promise that is ready run, without moving the clock. */
function flush(): Promise<unknown> {
  return vi.advanceTimersByTimeAsync(0)
}

/** Exactly one warning, which holds `count` as a number and `error`, or any Error when none is given. */
function expectOneWarning(count: number, error?: Error): void {
  expect(consoleWarn).toHaveBeenCalledTimes(1)
  const [args = []] = consoleWarn.mock.calls
  expect(args).toContain(count)
  if (error === undefined) expect(args).toContainEqual(expect.any(Error))
  else expect(args).toContain(error)
}

/** Ports over the memory fall-back of a first index whose puts for the ids `stalls` names never answer. */
async function portsWithStalledPuts(stalls: (id: string) => boolean) {
  const first = new InMemoryProjectIndex()
  stallPuts(first, stalls)
  const ports = rebuildPorts({ index: withMemoryFallback(first) })
  await placeSound(ports, FIVE_IDS)
  return { first, ports }
}

describe('puts that do not answer', () => {
  it('when no put answers, the run ends one write limit after its reads, with every record and one warning that counts five failed puts', async () => {
    const { ports } = await portsWithStalledPuts(() => true)

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS - 1)
    expect(state()).toEqual(PENDING)
    await vi.advanceTimersByTimeAsync(1)

    expect(state().status).toBe('answered')
    await expect(rebuilding).resolves.toEqual(FIVE_IDS.map((id) => soundRecordOf(id)))
    expectOneWarning(5)
  })

  it('when only the put of the first project does not answer, the others are in the index before the limit, and at the limit the run gives all five with a count of one', async () => {
    const { first, ports } = await portsWithStalledPuts((id) => id === 'a')

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS - 1)
    expect(state()).toEqual(PENDING)
    expect(idsOf(await first.all())).toEqual(['b', 'c', 'd', 'e'])
    await vi.advanceTimersByTimeAsync(1)

    expect(state().status).toBe('answered')
    await expect(rebuilding).resolves.toEqual(FIVE_IDS.map((id) => soundRecordOf(id)))
    expect(idsOf(await first.all())).toEqual(['b', 'c', 'd', 'e'])
    expectOneWarning(1)
  })
})

/** From now on each read of the store answers `READ_TIME_MS` after its call, on the fake clock. */
function slowReads(ports: ReturnType<typeof rebuildPorts>): void {
  const realRead = ports.workspace.read.bind(ports.workspace)
  ports.workspace.read = async (id) => {
    await new Promise((resolve) => setTimeout(resolve, READ_TIME_MS))
    return realRead(id)
  }
}

describe('puts that do not answer, behind reads that take time', () => {
  it('the run ends one write limit after its last read ends, and not one millisecond before', async () => {
    const { ports } = await portsWithStalledPuts(() => true)
    slowReads(ports)
    const lastReadEnds = FIVE_IDS.length * READ_TIME_MS

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await vi.advanceTimersByTimeAsync(lastReadEnds + INDEX_WRITE_WAIT_MS - 1)
    expect(state()).toEqual(PENDING)
    await vi.advanceTimersByTimeAsync(1)

    expect(state().status).toBe('answered')
    await expect(rebuilding).resolves.toEqual(FIVE_IDS.map((id) => soundRecordOf(id)))
    expectOneWarning(FIVE_IDS.length)
  })
})

describe('when the puts start and when the run waits for them', () => {
  it('the put of a record starts as it is built: the second project is read while the put of the first is still pending', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const put = holdPutOf(ports.index, 'a')
    const read = vi.spyOn(ports.workspace, 'read')

    const rebuilding = reconcileIndex(ports)
    await flush()

    expect(put.started()).toBe(true)
    expect(read.mock.calls).toEqual([['a'], ['b']])
    put.release()
    await expect(rebuilding).resolves.toEqual([soundRecordOf('a'), soundRecordOf('b')])
  })

  it('at most one read of the store is in flight at any time', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, FIVE_IDS)
    await placeDocument(ports, 'broken', notJsonBytes())
    const mostInFlight = trackReadsInFlight(ports)

    expect(await reconcileIndex(ports)).toHaveLength(FIVE_IDS.length + 1)

    expect(mostInFlight()).toBe(1)
  })

  it('the run resolves only after every put settled, and a second call then finds nothing to do', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, THREE_IDS)
    const put = holdPutOf(ports.index, 'c')
    const read = vi.spyOn(ports.workspace, 'read')

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await flush()
    expect([read.mock.calls.length, put.started(), state()]).toEqual([3, true, PENDING])
    put.release()

    const records = await rebuilding
    expect(records).toEqual(THREE_IDS.map((id) => soundRecordOf(id)))
    expect(await ports.index.all()).toEqual(records)
    read.mockClear()
    const putAgain = vi.spyOn(ports.index, 'put')
    expect(await reconcileIndex(ports)).toEqual(records)
    expect([read.mock.calls.length, putAgain.mock.calls.length]).toEqual([0, 0])
  })
})

describe('puts that fail', () => {
  it('a put that rejects at once for the second of three projects does not stop the put of the third', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, THREE_IDS)
    const error = new Error('the index is full')
    const realPut = ports.index.put.bind(ports.index)
    vi.spyOn(ports.index, 'put').mockImplementation((record) =>
      record.id === 'b' ? Promise.reject(error) : realPut(record),
    )

    const records = await reconcileIndex(ports)

    expect(records).toEqual(THREE_IDS.map((id) => soundRecordOf(id)))
    expect(idsOf(await ports.index.all())).toEqual(['a', 'c'])
    expectOneWarning(1, error)
  })

  it('the warning comes after the last put settled: a put that rejects late is counted in the one warning', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, THREE_IDS)
    const put = holdPutOf(ports.index, 'c')
    const error = new Error('the put of c fails late')

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await flush()
    expect([put.started(), state()]).toEqual([true, PENDING])
    expect(consoleWarn).not.toHaveBeenCalled()
    put.reject(error)

    expect(await rebuilding).toHaveLength(THREE_IDS.length)
    expectOneWarning(1, error)
  })
})

describe('what the run puts and when it removes', () => {
  it('among kept and rebuilt records, only the rebuilt ones are put', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b', 'c', 'd'])
    await ports.index.put(sampleRecord({ id: 'a', lastChangedAt: STORED_AT }))
    await ports.index.put(sampleRecord({ id: 'b', lastChangedAt: EARLIER_CHANGE }))
    await ports.index.put(sampleRecord({ id: 'c', lastChangedAt: STORED_AT }))
    const put = vi.spyOn(ports.index, 'put')

    expect(idsOf(await reconcileIndex(ports))).toEqual(['a', 'b', 'c', 'd'])

    expect(put.mock.calls.map(([record]) => record.id)).toEqual(['b', 'd'])
  })

  it('no project is read and nothing is put until the removes of gone records have settled', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(sampleRecord({ id: 'gone' }))
    const removes = holdWrites(ports.index, 'remove')
    const read = vi.spyOn(ports.workspace, 'read')
    const put = vi.spyOn(ports.index, 'put')

    const rebuilding = reconcileIndex(ports)
    await flush()
    expect([removes.started(), read.mock.calls.length, put.mock.calls.length]).toEqual([1, 0, 0])
    removes.answerOldest()

    expect(await rebuilding).toEqual([soundRecordOf('a')])
    expect(read.mock.calls).toEqual([['a']])
    expect(idsOf(await ports.index.all())).toEqual(['a'])
  })
})
