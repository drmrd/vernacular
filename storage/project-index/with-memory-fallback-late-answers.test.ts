import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import {
  holdReads,
  sampleRecord,
  watch,
  type ReadMethod,
  type Watched,
} from './project-record-test-kit'
import { withMemoryFallback } from './with-memory-fallback'

const READS: readonly ReadMethod[] = ['all', 'get']
const REFUSAL = new Error('the first index refused')
const HOUSE = sampleRecord()
const EMPTY_ANSWER: Record<ReadMethod, unknown> = { all: [], get: undefined }
const FIRST_ANSWER: Record<ReadMethod, unknown> = { all: [HOUSE], get: HOUSE }

let consoleWarn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
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

/** Makes the next reads of `first` that `read` names reject with the refusal. */
function refuseReads(first: ProjectIndex, read: ReadMethod): void {
  if (read === 'all') vi.spyOn(first, 'all').mockRejectedValue(REFUSAL)
  else vi.spyOn(first, 'get').mockRejectedValue(REFUSAL)
}

/** A wrapper over a first index that holds the house and holds one of its reads. */
async function wrapperWithHeldRead(held: ReadMethod) {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const hold = holdReads(first, held)
  refuseReads(first, otherRead(held))
  return { index: withMemoryFallback(first), hold }
}

describe('a read that is pending on the first index when another read makes the object switch', () => {
  it.each(READS)(
    'is answered from memory, not with the answer of the first index, when that answer comes after the switch (the pending read is %s)',
    async (pending) => {
      const { index, hold } = await wrapperWithHeldRead(pending)
      const slow = watch(readOf(index, pending))

      const failing = await seen(readOf(index, otherRead(pending)))
      hold.answerOldest()
      await settle()

      expect(failing).toEqual(answered(EMPTY_ANSWER[otherRead(pending)]))
      expect(slow()).toEqual(answered(EMPTY_ANSWER[pending]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(READS)(
    'is answered from memory with no second warning when it rejects after the switch (the pending read is %s)',
    async (pending) => {
      const { index, hold } = await wrapperWithHeldRead(pending)
      const slow = watch(readOf(index, pending))
      await seen(readOf(index, otherRead(pending)))

      hold.rejectOldest(new Error('the first index failed late'))
      await settle()

      expect(slow()).toEqual(answered(EMPTY_ANSWER[pending]))
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(READS)(
    'keeps the answer of the first index when that answer came before the switch (the answered read is %s)',
    async (pending) => {
      const { index, hold } = await wrapperWithHeldRead(pending)
      const early = watch(readOf(index, pending))
      hold.answerOldest()
      await settle()

      await seen(readOf(index, otherRead(pending)))

      expect(early()).toEqual(answered(FIRST_ANSWER[pending]))
      expect(await seen(readOf(index, pending))).toEqual(answered(EMPTY_ANSWER[pending]))
    },
  )
})

describe('a console that cannot warn', () => {
  it.each(READS)(
    'does not make the read that switches reject: it is answered from memory, and so is the next read (%s)',
    async (read) => {
      const first = new InMemoryProjectIndex()
      await first.put(HOUSE)
      refuseReads(first, read)
      consoleWarn.mockImplementation(() => {
        throw new Error('the console is closed')
      })
      const index = withMemoryFallback(first)

      const switching = await seen(readOf(index, read))
      const next = await seen(readOf(index, otherRead(read)))

      expect(switching).toEqual(answered(EMPTY_ANSWER[read]))
      expect(next).toEqual(answered(EMPTY_ANSWER[otherRead(read)]))
    },
  )
})
