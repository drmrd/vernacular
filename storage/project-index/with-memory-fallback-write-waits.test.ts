import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import {
  holdReads,
  holdWrites,
  sampleRecord,
  watch,
  type Watched,
  type WriteMethod,
} from './project-record-test-kit'
import { INDEX_READ_WAIT_MS, INDEX_WRITE_WAIT_MS, withMemoryFallback } from './with-memory-fallback'

type Order = 'write first' | 'read first'

const WRITES: readonly WriteMethod[] = ['put', 'remove']
const HOUSE = sampleRecord()
const BARN = sampleRecord({ id: 'barn', name: 'Barn' })
const SECOND_WRITE_DELAY_MS = 250
const FAILURE = new Error('the first index refused')
// Only until the constant exists, so that a case fails on its assertion and not on a wait of NaN.
const WAIT_WHEN_MISSING_MS = 1_000
const WRITE_WAIT_MS = Number.isFinite(INDEX_WRITE_WAIT_MS)
  ? INDEX_WRITE_WAIT_MS
  : WAIT_WHEN_MISSING_MS

const PENDING: Watched = { status: 'pending' }
const TOO_LATE: Watched = { status: 'rejected', error: expect.any(Error) }

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

/** A first index that holds the house and the barn, with one write held and a spy on each method. */
async function firstWithHeldWrite(held: WriteMethod) {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  await first.put(BARN)
  const hold = holdWrites(first, held)
  const calls = {
    put: vi.spyOn(first, 'put'),
    remove: vi.spyOn(first, 'remove'),
    all: vi.spyOn(first, 'all'),
  }
  return { first, hold, calls }
}

/** The record that a `put` of `id` writes in these cases. */
function recordOf(id: string) {
  return sampleRecord({ id, name: 'Written' })
}

/** A write of the kind `write` names, to the project `id`. */
function writeOf(index: ProjectIndex, write: WriteMethod, id: string): Promise<void> {
  return write === 'put' ? index.put(recordOf(id)) : index.remove(id)
}

/** The arguments that the first index gets for `writeOf`. */
function argumentsOf(write: WriteMethod, id: string): unknown[] {
  return write === 'put' ? [recordOf(id)] : [id]
}

function answered(value: unknown): Watched {
  return { status: 'answered', value }
}

/** The error of a rejected state, and undefined for any other state. */
function errorOf(state: Watched): unknown {
  return state.status === 'rejected' ? state.error : undefined
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

describe('a write to a first index that gives no answer', () => {
  it.each(WRITES)(
    'is pending one millisecond before the time is up and rejects with an Error at the limit (%s)',
    async (write) => {
      const { first } = await firstWithHeldWrite(write)
      const result = watch(writeOf(withMemoryFallback(first), write, HOUSE.id))

      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS - 1)
      expect(result()).toEqual(PENDING)
      await vi.advanceTimersByTimeAsync(1)

      expect(result()).toEqual(TOO_LATE)
    },
  )

  it.each(WRITES)(
    'switches nothing and warns nothing: reads and later writes still use the first index (%s)',
    async (write) => {
      const { first, hold, calls } = await firstWithHeldWrite(write)
      const index = withMemoryFallback(first)
      const result = watch(writeOf(index, write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS)
      expect(result()).toEqual(TOO_LATE)

      expect(await seen(index.all())).toEqual(answered([BARN, HOUSE]))
      const later = watch(writeOf(index, write, BARN.id))
      hold.answerOldest()
      hold.answerOldest()
      await settle()

      expect(later()).toEqual(answered(undefined))
      expect(calls[write].mock.calls[1]).toEqual(argumentsOf(write, BARN.id))
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )

  it.each(WRITES)(
    'two such writes each reject at their own limit, the second one 250 ms after the first (%s)',
    async (write) => {
      const { first } = await firstWithHeldWrite(write)
      const index = withMemoryFallback(first)
      const earlier = watch(writeOf(index, write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(SECOND_WRITE_DELAY_MS)
      const later = watch(writeOf(index, write, BARN.id))

      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS - SECOND_WRITE_DELAY_MS - 1)
      expect([earlier(), later()]).toEqual([PENDING, PENDING])
      await vi.advanceTimersByTimeAsync(1)
      expect([earlier(), later()]).toEqual([TOO_LATE, PENDING])
      await vi.advanceTimersByTimeAsync(SECOND_WRITE_DELAY_MS - 1)
      expect(later()).toEqual(PENDING)
      await vi.advanceTimersByTimeAsync(1)

      expect(later()).toEqual(TOO_LATE)
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )

  it.each(WRITES)(
    'changes nothing when the first index answers late: the caller keeps the rejection and nothing warns (%s)',
    async (write) => {
      const { first, hold } = await firstWithHeldWrite(write)
      const result = watch(writeOf(withMemoryFallback(first), write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS)

      hold.answerOldest()
      await settle()

      expect(result()).toEqual(TOO_LATE)
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )

  it.each(WRITES)(
    'leaves no unhandled rejection and no warning when the first index rejects late (%s)',
    async (write) => {
      const { first, hold } = await firstWithHeldWrite(write)
      const result = watch(writeOf(withMemoryFallback(first), write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS)
      expect(result()).toEqual(TOO_LATE)

      hold.rejectOldest(new Error('the first index failed too late'))
      await settle()
      vi.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleWarn).not.toHaveBeenCalled()
      expect(unhandled).not.toHaveBeenCalled()
    },
  )
})

describe('a write to a first index that answers or fails in time', () => {
  it.each(WRITES)(
    'resolves when answered one millisecond before the time is up, and leaves no timer (%s)',
    async (write) => {
      const { first, hold } = await firstWithHeldWrite(write)
      const result = watch(writeOf(withMemoryFallback(first), write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS - 1)

      hold.answerOldest()
      await settle()

      expect(result()).toEqual(answered(undefined))
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(WRITES)(
    'rejects with the same error when the first index rejects in time, and leaves no timer (%s)',
    async (write) => {
      const { first, hold } = await firstWithHeldWrite(write)
      const result = watch(writeOf(withMemoryFallback(first), write, HOUSE.id))
      await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS - 1)

      hold.rejectOldest(FAILURE)
      await settle()

      expect(errorOf(result())).toBe(FAILURE)
      expect(vi.getTimerCount()).toBe(0)
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )

  it.each(WRITES)(
    'rejects with the same error when the first index throws at once, and leaves no timer (%s)',
    async (write) => {
      const { first, calls } = await firstWithHeldWrite(write)
      calls[write].mockImplementation(() => {
        throw FAILURE
      })

      const result = await seen(writeOf(withMemoryFallback(first), write, HOUSE.id))

      expect(errorOf(result)).toBe(FAILURE)
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})

describe('a write after the switch and a write beside a read that gives no answer', () => {
  it.each(WRITES)(
    'a write after the switch goes to memory, resolves, and makes no timer (%s)',
    async (write) => {
      const { first, hold, calls } = await firstWithHeldWrite(write)
      calls.all.mockRejectedValue(FAILURE)
      const index = withMemoryFallback(first)
      await seen(index.all())

      const result = watch(writeOf(index, write, HOUSE.id))
      expect(vi.getTimerCount()).toBe(0)
      await settle()

      expect(result()).toEqual(answered(undefined))
      expect(vi.getTimerCount()).toBe(0)
      expect(hold.started()).toBe(0)
    },
  )

  it.each([
    ['put', 'write first'],
    ['put', 'read first'],
    ['remove', 'write first'],
    ['remove', 'read first'],
  ] as const satisfies ReadonlyArray<readonly [WriteMethod, Order]>)(
    'a write and a read that get no answer: at the limit the read is answered from memory with one warning and the write rejects (%s, %s)',
    async (write, order) => {
      const { first, hold } = await firstWithHeldWrite(write)
      holdReads(first, 'all')
      const index = withMemoryFallback(first)
      const starts = {
        write: () => watch(writeOf(index, write, HOUSE.id)),
        read: () => watch(index.all()),
      }
      const [one, two] =
        order === 'write first' ? [starts.write(), starts.read()] : [starts.read(), starts.write()]
      const [rejected, read] = order === 'write first' ? [one, two] : [two, one]

      await vi.advanceTimersByTimeAsync(Math.max(INDEX_READ_WAIT_MS, WRITE_WAIT_MS))

      expect(rejected()).toEqual(TOO_LATE)
      expect(read()).toEqual(answered([]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(await seen(writeOf(index, write, BARN.id))).toEqual(answered(undefined))
      expect(hold.started()).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('the late answer of a put that was rejected at the switch lands in the first index and never in memory', async () => {
    const { first, hold } = await firstWithHeldWrite('put')
    holdReads(first, 'all')
    const index = withMemoryFallback(first)
    const put = watch(index.put(recordOf('cellar')))
    const read = watch(index.all())
    await vi.advanceTimersByTimeAsync(Math.max(INDEX_READ_WAIT_MS, WRITE_WAIT_MS))
    expect([put(), read()]).toEqual([TOO_LATE, answered([])])

    hold.answerOldest()
    await settle()

    expect(await first.get('cellar')).toEqual(recordOf('cellar'))
    expect(await seen(index.get('cellar'))).toEqual(answered(undefined))
  })
})
