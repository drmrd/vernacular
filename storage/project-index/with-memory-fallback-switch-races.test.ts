import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import {
  holdReads,
  holdWrites,
  sampleRecord,
  watch,
  type ReadHold,
  type ReadMethod,
  type Watched,
  type WriteMethod,
} from './project-record-test-kit'
import { INDEX_WRITE_WAIT_MS, withMemoryFallback } from './with-memory-fallback'

type Pairing = readonly [ReadMethod, ReadMethod]

const READS: readonly ReadMethod[] = ['all', 'get']
const WRITES: readonly WriteMethod[] = ['put', 'remove']
const MIXED_PAIRINGS: readonly Pairing[] = [
  ['all', 'get'],
  ['get', 'all'],
]
const WRITES_BESIDE_READS = WRITES.flatMap((write) => READS.map((read) => [write, read] as const))
const HOUSE = sampleRecord()
const BARN = sampleRecord({ id: 'barn', name: 'Barn' })
const READ_FAILURE = new Error('the read of the first index failed')
const WRITE_FAILURE = new Error('the write of the first index failed')
const EMPTY_ANSWER: Record<ReadMethod, unknown> = { all: [], get: undefined }
const FIRST_ANSWER: Record<ReadMethod, unknown> = { all: [HOUSE], get: HOUSE }
const PENDING: Watched = { status: 'pending' }

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

function writeOf(index: ProjectIndex, write: WriteMethod): Promise<void> {
  return write === 'put' ? index.put(BARN) : index.remove(HOUSE.id)
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

/** Lets one tick of the real clock run, so that an unhandled rejection shows. */
async function tickOfTheRealClock(): Promise<void> {
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Which index gave `value` as the answer of `read`: the first index or the empty memory. */
function sourceOf(read: ReadMethod, value: unknown): string {
  const text = JSON.stringify(value)
  if (text === JSON.stringify(FIRST_ANSWER[read])) return 'first'
  if (text === JSON.stringify(EMPTY_ANSWER[read])) return 'memory'
  return 'neither'
}

/** Starts each read and lists `read:source` for each, in the order that the callers see them settle. */
function settlingOrder(index: ProjectIndex, reads: Pairing): string[] {
  const order: string[] = []
  for (const read of reads) {
    readOf(index, read).then(
      (value) => order.push(`${read}:${sourceOf(read, value)}`),
      () => order.push(`${read}:rejected`),
    )
  }
  return order
}

/** A wrapper over a first index that holds the house, with both of its reads held. */
async function wrapperWithBothReadsHeld() {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const holds: Record<ReadMethod, ReadHold> = {
    all: holdReads(first, 'all'),
    get: holdReads(first, 'get'),
  }
  return { index: withMemoryFallback(first), holds }
}

/** A wrapper over a first index that holds the house, with its writes held and the read refused. */
async function wrapperWithHeldWrite(write: WriteMethod, switching: ReadMethod) {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const hold = holdWrites(first, write)
  if (switching === 'all') vi.spyOn(first, 'all').mockRejectedValue(READ_FAILURE)
  else vi.spyOn(first, 'get').mockRejectedValue(READ_FAILURE)
  return { index: withMemoryFallback(first), hold }
}

describe('a read that the first index answers in the same step as another read rejects', () => {
  it.each(MIXED_PAIRINGS)(
    'when the answer comes first, the answered read settles first with that answer and the other read gets memory (%s answered, %s rejected)',
    async (answeredRead, rejectedRead) => {
      const { index, holds } = await wrapperWithBothReadsHeld()
      const order = settlingOrder(index, [answeredRead, rejectedRead])

      holds[answeredRead].answerOldestWith(FIRST_ANSWER[answeredRead])
      holds[rejectedRead].rejectOldest(READ_FAILURE)
      await settle()

      expect(order).toEqual([`${answeredRead}:first`, `${rejectedRead}:memory`])
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(MIXED_PAIRINGS)(
    'when the rejection comes first, no caller sees an answer of the first index after one from memory, and later reads come from memory (%s answered, %s rejected)',
    async (answeredRead, rejectedRead) => {
      const { index, holds } = await wrapperWithBothReadsHeld()
      const order = settlingOrder(index, [answeredRead, rejectedRead])

      holds[rejectedRead].rejectOldest(READ_FAILURE)
      holds[answeredRead].answerOldestWith(FIRST_ANSWER[answeredRead])
      await settle()

      expect(order).not.toEqual([`${rejectedRead}:memory`, `${answeredRead}:first`])
      expect([
        [`${answeredRead}:first`, `${rejectedRead}:memory`],
        [`${answeredRead}:memory`, `${rejectedRead}:memory`],
        [`${rejectedRead}:memory`, `${answeredRead}:memory`],
      ]).toContainEqual(order)
      expect(await seen(readOf(index, answeredRead))).toEqual(answered(EMPTY_ANSWER[answeredRead]))
      expect(await seen(readOf(index, rejectedRead))).toEqual(answered(EMPTY_ANSWER[rejectedRead]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )
})

describe('a write that is in flight when a read switches the object to memory', () => {
  it.each(WRITES_BESIDE_READS)(
    'rejects to its caller with the error of the first index when that index rejects in time, and leaves no timer and nothing unhandled (%s, the switching read is %s)',
    async (write, switching) => {
      const { index, hold } = await wrapperWithHeldWrite(write, switching)
      const result = watch(writeOf(index, write))
      expect(await seen(readOf(index, switching))).toEqual(answered(EMPTY_ANSWER[switching]))

      hold.rejectOldest(WRITE_FAILURE)
      await settle()

      expect(result()).toEqual({ status: 'rejected', error: WRITE_FAILURE })
      expect(vi.getTimerCount()).toBe(0)
      await tickOfTheRealClock()
      expect(unhandled).not.toHaveBeenCalled()
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(WRITES_BESIDE_READS)(
    'rejects at its own limit, and a later rejection of the first index leaves nothing unhandled and no second warning (%s, the switching read is %s)',
    async (write, switching) => {
      const { index, hold } = await wrapperWithHeldWrite(write, switching)
      const result = watch(writeOf(index, write))
      await seen(readOf(index, switching))
      await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS - 1)
      expect(result()).toEqual(PENDING)
      await vi.advanceTimersByTimeAsync(1)
      expect(result()).toEqual({ status: 'rejected', error: expect.any(Error) })

      hold.rejectOldest(WRITE_FAILURE)
      await settle()
      await tickOfTheRealClock()

      expect(result()).not.toEqual({ status: 'rejected', error: WRITE_FAILURE })
      expect(unhandled).not.toHaveBeenCalled()
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )
})
