import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import {
  holdFirstPut,
  holdReads,
  sampleRecord,
  watch,
  type ReadHold,
  type ReadMethod,
  type Watched,
} from './project-record-test-kit'
import { INDEX_READ_WAIT_MS, withMemoryFallback } from './with-memory-fallback'

type Pairing = readonly [ReadMethod, ReadMethod]

const READS: readonly ReadMethod[] = ['all', 'get']
const WRITES = ['put', 'remove'] as const
const PAIRINGS: readonly Pairing[] = [
  ['all', 'all'],
  ['get', 'get'],
  ['all', 'get'],
  ['get', 'all'],
]
const MIXED_PAIRINGS: readonly Pairing[] = [
  ['all', 'get'],
  ['get', 'all'],
]
const HOUSE = sampleRecord()
const BARN = sampleRecord({ id: 'barn', name: 'Barn' })
const FIRST_ERROR = new Error('the first read failed')
const SECOND_ERROR = new Error('the second read failed')
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

/** Lets the ready promises and one tick of the real clock run, so that an unhandled rejection shows. */
async function tickOfTheRealClock(): Promise<void> {
  await settle()
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Makes every read of `first` that `read` names reject with `error`. */
function refuseReads(first: ProjectIndex, read: ReadMethod, error: Error): void {
  if (read === 'all') vi.spyOn(first, 'all').mockRejectedValue(error)
  else vi.spyOn(first, 'get').mockRejectedValue(error)
}

/** Makes the next read of `first` that `read` names reject with `error`; later reads answer as before. */
function refuseNextRead(first: ProjectIndex, read: ReadMethod, error: Error): void {
  if (read === 'all') vi.spyOn(first, 'all').mockRejectedValueOnce(error)
  else vi.spyOn(first, 'get').mockRejectedValueOnce(error)
}

/** Makes every read of `first` that `read` names throw `error` at once, with no promise. */
function throwOnReads(first: ProjectIndex, read: ReadMethod, error: Error): void {
  const throwIt = (): never => {
    throw error
  }
  if (read === 'all') vi.spyOn(first, 'all').mockImplementation(throwIt)
  else vi.spyOn(first, 'get').mockImplementation(throwIt)
}

/** A first index that holds the house, with both of its reads held. */
async function firstWithBothReadsHeld() {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const holds: Record<ReadMethod, ReadHold> = {
    all: holdReads(first, 'all'),
    get: holdReads(first, 'get'),
  }
  return { first, holds }
}

/** A wrapper over a first index that holds the house, with one read held and the other one refused. */
async function wrapperWithHeldRead(held: ReadMethod) {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const hold = holdReads(first, held)
  refuseReads(first, otherRead(held), FIRST_ERROR)
  return { index: withMemoryFallback(first), hold }
}

describe('reads that settle together', () => {
  it.each(PAIRINGS)(
    'two reads that fail at the same time are both answered from memory, with one warning that carries the first error (%s then %s)',
    async (firstRead, secondRead) => {
      const { first, holds } = await firstWithBothReadsHeld()
      const index = withMemoryFallback(first)
      const one = watch(readOf(index, firstRead))
      const two = watch(readOf(index, secondRead))

      holds[firstRead].rejectOldest(FIRST_ERROR)
      holds[secondRead].rejectOldest(SECOND_ERROR)
      await settle()

      expect(one()).toEqual(answered(EMPTY_ANSWER[firstRead]))
      expect(two()).toEqual(answered(EMPTY_ANSWER[secondRead]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(consoleWarn.mock.calls[0]).toContain(FIRST_ERROR)
    },
  )

  it.each(MIXED_PAIRINGS)(
    'a read the first index answered keeps that answer when another read rejects in the same step (%s answered, %s rejected)',
    async (answeredRead, rejectedRead) => {
      const { first, holds } = await firstWithBothReadsHeld()
      const index = withMemoryFallback(first)
      const early = watch(readOf(index, answeredRead))
      const failing = watch(readOf(index, rejectedRead))

      holds[rejectedRead].rejectOldest(FIRST_ERROR)
      holds[answeredRead].answerOldestWith(FIRST_ANSWER[answeredRead])
      await settle()

      expect(early()).toEqual(answered(FIRST_ANSWER[answeredRead]))
      expect(failing()).toEqual(answered(EMPTY_ANSWER[rejectedRead]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )
})

describe('writes around the switch', () => {
  it.each(READS)(
    'a put that is in flight at the switch lands in the first index and never in memory (the switching read is %s)',
    async (switching) => {
      const first = new InMemoryProjectIndex()
      await first.put(HOUSE)
      const heldPut = holdFirstPut(first)
      refuseNextRead(first, switching, FIRST_ERROR)
      const index = withMemoryFallback(first)
      void index.put(BARN)

      await seen(readOf(index, switching))
      heldPut.release()
      await settle()

      expect(await first.get(BARN.id)).toEqual(BARN)
      expect(await seen(index.get(BARN.id))).toEqual(answered(undefined))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(WRITES)(
    'a %s of the first index that throws at once rejects to the caller with that error, switches nothing, and warns nothing',
    async (write) => {
      const first = new InMemoryProjectIndex()
      await first.put(HOUSE)
      const failure = new Error('the write threw')
      const throwIt = (): never => {
        throw failure
      }
      vi.spyOn(first, write).mockImplementation(throwIt)
      const index = withMemoryFallback(first)

      const result = await seen(write === 'put' ? index.put(BARN) : index.remove(HOUSE.id))

      expect(result).toEqual({ status: 'rejected', error: failure })
      expect(await seen(index.all())).toEqual(answered([HOUSE]))
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )
})

describe('the timers of a read', () => {
  it.each(READS)('a read whose first index throws at once leaves no timer (%s)', async (read) => {
    const first = new InMemoryProjectIndex()
    throwOnReads(first, read, FIRST_ERROR)

    const result = await seen(readOf(withMemoryFallback(first), read))

    expect(result).toEqual(answered(EMPTY_ANSWER[read]))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(READS)(
    'a read that the first index rejects in time leaves no timer (%s)',
    async (read) => {
      const { index, hold } = await wrapperWithHeldRead(read)
      const result = watch(readOf(index, read))
      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - 1)

      hold.rejectOldest(FIRST_ERROR)
      await settle()

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(READS)(
    'a read after the switch makes no timer, while it runs and after it (%s)',
    async (read) => {
      const first = new InMemoryProjectIndex()
      refuseReads(first, read, FIRST_ERROR)
      const index = withMemoryFallback(first)
      await seen(readOf(index, read))

      const later = watch(readOf(index, otherRead(read)))
      expect(vi.getTimerCount()).toBe(0)
      await settle()

      expect(later()).toEqual(answered(EMPTY_ANSWER[otherRead(read)]))
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})

describe('a late rejection when the console cannot warn', () => {
  it.each(READS)(
    'a read answered from memory at its time limit leaves no unhandled rejection when the held call rejects late (%s)',
    async (read) => {
      consoleWarn.mockImplementation(() => {
        throw new Error('the console is closed')
      })
      const first = new InMemoryProjectIndex()
      const hold = holdReads(first, read)
      const result = watch(readOf(withMemoryFallback(first), read))
      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS)

      hold.rejectOldest(FIRST_ERROR)
      await tickOfTheRealClock()

      expect(result()).toEqual(answered(EMPTY_ANSWER[read]))
      expect(unhandled).not.toHaveBeenCalled()
    },
  )

  it.each(READS)(
    'a read that is pending when another read switches leaves no unhandled rejection when it rejects (%s)',
    async (pending) => {
      consoleWarn.mockImplementation(() => {
        throw new Error('the console is closed')
      })
      const { index, hold } = await wrapperWithHeldRead(pending)
      const slow = watch(readOf(index, pending))
      const switching = await seen(readOf(index, otherRead(pending)))

      hold.rejectOldest(SECOND_ERROR)
      await tickOfTheRealClock()

      expect(switching).toEqual(answered(EMPTY_ANSWER[otherRead(pending)]))
      expect(slow()).toEqual(answered(EMPTY_ANSWER[pending]))
      expect(unhandled).not.toHaveBeenCalled()
    },
  )
})
