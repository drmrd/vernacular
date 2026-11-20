import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import {
  holdReads,
  sampleRecord,
  watch,
  type ReadMethod,
  type Watched,
} from './project-record-test-kit'
import { INDEX_READ_WAIT_MS, withMemoryFallback } from './with-memory-fallback'

const READS: readonly ReadMethod[] = ['all', 'get']
const HOUSE = sampleRecord()
const BARN = sampleRecord({ id: 'barn', name: 'Barn' })
const SECOND_READ_DELAY_MS = 250

const PENDING: Watched = { status: 'pending' }
const EMPTY_ANSWER: Record<ReadMethod, unknown> = { all: [], get: undefined }
const FIRST_ANSWER: Record<ReadMethod, unknown> = { all: [HOUSE], get: HOUSE }

let consoleWarn: ReturnType<typeof vi.spyOn>
let unhandled: Mock<(reason: unknown) => void>

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  unhandled = vi.fn<(reason: unknown) => void>()
  process.on('unhandledRejection', unhandled)
})
afterEach(() => {
  process.off('unhandledRejection', unhandled)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A first index that holds the house, with one of its reads held, and a spy on each method. */
async function firstWithHeldRead(held: ReadMethod) {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const hold = holdReads(first, held)
  const calls = {
    all: vi.spyOn(first, 'all'),
    get: vi.spyOn(first, 'get'),
    put: vi.spyOn(first, 'put'),
    remove: vi.spyOn(first, 'remove'),
  }
  return { first, hold, calls }
}

function readOf(index: ProjectIndex, read: ReadMethod): Promise<unknown> {
  return read === 'all' ? index.all() : index.get(HOUSE.id)
}

function otherRead(read: ReadMethod): ReadMethod {
  return read === 'all' ? 'get' : 'all'
}

function answered(value: unknown): Watched {
  return { status: 'answered', value }
}

/** Lets the promises that are ready run, without moving the clock. */
function settle(): Promise<unknown> {
  return vi.advanceTimersByTimeAsync(0)
}

/** Where `promise` stands once the ready promises ran. It never waits for a promise that is held. */
async function seen(promise: Promise<unknown>): Promise<Watched> {
  const state = watch(promise)
  await settle()
  return state()
}

/** Starts a read that the first index holds, and moves the clock to the time limit. */
async function readUntilTimeUp(read: ReadMethod) {
  const { first, hold, calls } = await firstWithHeldRead(read)
  const index = withMemoryFallback(first)
  const result = watch(readOf(index, read))
  await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - 1)
  expect(result()).toEqual(PENDING)
  await vi.advanceTimersByTimeAsync(1)
  return { index, result, hold, calls }
}

describe('a read of a first index that gives no answer', () => {
  it.each(READS)(
    'is answered from memory when the time is up, and is still pending one millisecond before (%s)',
    async (read) => {
      const { result } = await readUntilTimeUp(read)

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
    },
  )

  it.each(READS)(
    'switches with exactly one warning that carries an Error, however long the clock runs on (%s)',
    async (read) => {
      await readUntilTimeUp(read)
      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS * 2)

      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(consoleWarn.mock.calls[0]).toContainEqual(expect.any(Error))
    },
  )

  it.each(READS)(
    'leaves the first index alone after the switch, and a put is kept in memory and read back (%s)',
    async (read) => {
      const { index, calls } = await readUntilTimeUp(read)

      expect(await seen(index.put(BARN))).toEqual(answered(undefined))
      expect(await seen(index.get(BARN.id))).toEqual(answered(BARN))
      expect(await seen(index.all())).toEqual(answered([BARN]))
      expect(await seen(index.remove(BARN.id))).toEqual(answered(undefined))
      expect(await seen(index.get(HOUSE.id))).toEqual(answered(undefined))

      expect(calls.put).not.toHaveBeenCalled()
      expect(calls.remove).not.toHaveBeenCalled()
      expect(calls[otherRead(read)]).not.toHaveBeenCalled()
      expect(calls[read]).toHaveBeenCalledTimes(1)
    },
  )

  it.each(READS)(
    'is answered from memory also when the time is up and the console cannot warn (%s)',
    async (read) => {
      consoleWarn.mockImplementation(() => {
        throw new Error('the console is closed')
      })

      const { index, result } = await readUntilTimeUp(read)
      const next = watch(readOf(index, otherRead(read)))
      await settle()

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(next()).toEqual(answered(EMPTY_ANSWER[otherRead(read)]))
    },
  )

  it.each(READS)(
    'two such reads are each answered from memory at their own time limit, with one warning in all (%s)',
    async (read) => {
      const { first } = await firstWithHeldRead(read)
      const index = withMemoryFallback(first)
      const earlier = watch(readOf(index, read))
      await vi.advanceTimersByTimeAsync(SECOND_READ_DELAY_MS)
      const later = watch(readOf(index, read))

      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - SECOND_READ_DELAY_MS - 1)
      expect([earlier(), later()]).toEqual([PENDING, PENDING])
      await vi.advanceTimersByTimeAsync(1)
      expect([earlier(), later()]).toEqual([answered(EMPTY_ANSWER[read]), PENDING])
      await vi.advanceTimersByTimeAsync(SECOND_READ_DELAY_MS - 1)
      expect(later()).toEqual(PENDING)
      await vi.advanceTimersByTimeAsync(1)

      expect(later()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )
})

describe('a read that the first index answers or rejects after the time is up', () => {
  it.each(READS)(
    'changes nothing when it answers late: the caller keeps the memory answer, later reads come from memory, and nothing warns again (%s)',
    async (read) => {
      const { index, result, hold } = await readUntilTimeUp(read)

      hold.answerOldest()
      await settle()

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(await seen(readOf(index, read))).toEqual(answered(EMPTY_ANSWER[read]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(READS)(
    'changes nothing when it rejects late: no second warning and no unhandled rejection (%s)',
    async (read) => {
      const { result, hold } = await readUntilTimeUp(read)
      await settle()
      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)

      hold.rejectOldest(new Error('the first index answered too late'))
      await settle()
      vi.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(unhandled).not.toHaveBeenCalled()
    },
  )
})

describe('a first index that answers in time or only leaves writes pending', () => {
  it.each(READS)(
    'a read answered one millisecond before the time is up gives that answer, switches nothing, warns nothing, and leaves no timer (%s)',
    async (read) => {
      const { first, hold, calls } = await firstWithHeldRead(read)
      const index = withMemoryFallback(first)
      const result = watch(readOf(index, read))
      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - 1)

      hold.answerOldest()
      await settle()

      expect(result()).toEqual(answered(FIRST_ANSWER[read]))
      expect(vi.getTimerCount()).toBe(0)
      await index.put(BARN)
      expect(calls.put).toHaveBeenCalledWith(BARN)
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )

  it('a put and a remove stay pending after the time limit passed twice, switch nothing, and warn nothing', async () => {
    const first = new InMemoryProjectIndex()
    await first.put(HOUSE)
    vi.spyOn(first, 'put').mockImplementation(() => new Promise<void>(() => undefined))
    vi.spyOn(first, 'remove').mockImplementation(() => new Promise<void>(() => undefined))
    const readSpy = vi.spyOn(first, 'all')
    const index = withMemoryFallback(first)
    const put = watch(index.put(BARN))
    const remove = watch(index.remove(HOUSE.id))

    await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS * 2)

    expect([put(), remove()]).toEqual([PENDING, PENDING])
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(await seen(index.all())).toEqual(answered([HOUSE]))
    expect(readSpy).toHaveBeenCalledTimes(1)
  })
})
