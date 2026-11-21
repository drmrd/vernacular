import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex } from './project-index'
import { describeProjectIndexContract } from './project-index-contract'
import { failingIndex, sampleRecord } from './project-record-test-kit'
import { withMemoryFallback } from './with-memory-fallback'

type Read = 'all' | 'get'
type Write = 'put' | 'remove'

const READS: readonly Read[] = ['all', 'get']
const WRITES: readonly Write[] = ['put', 'remove']
const REFUSAL = new Error('the first index refused')
const HOUSE = sampleRecord()
const BARN = sampleRecord({ id: 'barn', name: 'Barn' })
const NO_CALLS = { all: 0, get: 0, put: 0, remove: 0 }

let consoleWarn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** A first index that holds the house, with a spy on each method that passes the call through. */
async function firstHoldingHouse() {
  const first = new InMemoryProjectIndex()
  await first.put(HOUSE)
  const calls = {
    all: vi.spyOn(first, 'all'),
    get: vi.spyOn(first, 'get'),
    put: vi.spyOn(first, 'put'),
    remove: vi.spyOn(first, 'remove'),
  }
  return { first, calls }
}

type WatchedCalls = Awaited<ReturnType<typeof firstHoldingHouse>>['calls']

/** How many times the first index got each method, by method. */
function countsOf(calls: WatchedCalls): Record<Read | Write, number> {
  return {
    all: calls.all.mock.calls.length,
    get: calls.get.mock.calls.length,
    put: calls.put.mock.calls.length,
    remove: calls.remove.mock.calls.length,
  }
}

function readOf(index: ProjectIndex, read: Read): Promise<unknown> {
  return read === 'all' ? index.all() : index.get(HOUSE.id)
}

function writeOf(index: ProjectIndex, write: Write): Promise<void> {
  return write === 'put' ? index.put(BARN) : index.remove(HOUSE.id)
}

function otherRead(read: Read): Read {
  return read === 'all' ? 'get' : 'all'
}

/** What a read of an index with no records gives. */
const EMPTY_ANSWER: Record<Read, unknown> = { all: [], get: undefined }

/** How many warnings carried `error` as an argument. */
function warningsAbout(error: Error): number {
  return consoleWarn.mock.calls.filter((call: unknown[]) => call.includes(error)).length
}

describeProjectIndexContract('withMemoryFallback over a sound index', () =>
  withMemoryFallback(new InMemoryProjectIndex()),
)

describe('withMemoryFallback while the first index answers', () => {
  it('while the first index answers, every call gives what the first index gives', async () => {
    const first = new InMemoryProjectIndex()
    await first.put(HOUSE)
    await first.put(BARN)
    const index = withMemoryFallback(first)

    expect(await index.all()).toEqual([BARN, HOUSE])
    expect(await index.get(HOUSE.id)).toEqual(HOUSE)
    expect(await index.get('nobody')).toBeUndefined()
    await index.put(sampleRecord({ id: 'cellar' }))
    expect(await first.get('cellar')).toEqual(sampleRecord({ id: 'cellar' }))
    await index.remove(BARN.id)
    expect(await first.get(BARN.id)).toBeUndefined()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it.each(WRITES)(
    'a put or a remove that rejects before any read failed rejects to the caller, and reads still come from the first index (%s rejects)',
    async (write) => {
      const { first, calls } = await firstHoldingHouse()
      calls[write].mockRejectedValueOnce(REFUSAL)
      const index = withMemoryFallback(first)

      await expect(writeOf(index, write)).rejects.toBe(REFUSAL)

      expect(await index.all()).toEqual([HOUSE])
      expect(calls.all).toHaveBeenCalledTimes(1)
      await index.put(BARN)
      expect(await first.get(BARN.id)).toEqual(BARN)
      expect(consoleWarn).not.toHaveBeenCalled()
    },
  )
})

describe('withMemoryFallback after a read of the first index rejects', () => {
  it.each(READS)(
    'a read that rejects is answered from memory: all() gives an empty list and get gives undefined, with one warning (the failing read is %s)',
    async (read) => {
      const { first, calls } = await firstHoldingHouse()
      calls[read].mockRejectedValue(REFUSAL)
      const index = withMemoryFallback(first)

      expect(await readOf(index, read)).toEqual(EMPTY_ANSWER[read])
      expect(await readOf(index, otherRead(read))).toEqual(EMPTY_ANSWER[otherRead(read)])

      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(warningsAbout(REFUSAL)).toBe(1)
    },
  )

  it.each(READS)(
    'after that read no call reaches the first index, and a put is kept in memory (the failing read is %s)',
    async (read) => {
      const { first, calls } = await firstHoldingHouse()
      calls[read].mockRejectedValue(REFUSAL)
      const index = withMemoryFallback(first)
      await readOf(index, read)

      await index.put(BARN)
      expect(await index.get(BARN.id)).toEqual(BARN)
      expect(await index.all()).toEqual([BARN])
      await index.remove(BARN.id)
      expect(await index.get(BARN.id)).toBeUndefined()
      expect(await index.get(HOUSE.id)).toBeUndefined()

      expect(countsOf(calls)).toEqual({ ...NO_CALLS, [read]: 1 })
    },
  )

  it.each(READS)(
    'a first index that throws counts like one that rejects (the failing read is %s)',
    async (read) => {
      const { first, calls } = await firstHoldingHouse()
      calls[read].mockImplementation(() => {
        throw REFUSAL
      })
      const index = withMemoryFallback(first)

      expect(await readOf(index, read)).toEqual(EMPTY_ANSWER[read])
      expect(await readOf(index, otherRead(read))).toEqual(EMPTY_ANSWER[otherRead(read)])

      expect(warningsAbout(REFUSAL)).toBe(1)
      expect(countsOf(calls)).toEqual({ ...NO_CALLS, [read]: 1 })
    },
  )

  it.each(READS)(
    'over an index that rejects every call, a record can be put and read back after the first read (the first read is %s)',
    async (read) => {
      const first = failingIndex()
      const index = withMemoryFallback(first)

      expect(await readOf(index, read)).toEqual(EMPTY_ANSWER[read])
      await index.put(HOUSE)

      expect(await index.get(HOUSE.id)).toEqual(HOUSE)
      expect(await index.all()).toEqual([HOUSE])
      expect(first.calls()).toBe(1)
    },
  )

  it('a new object over the same first index asks that index again, and the first index was never cleared', async () => {
    const { first, calls } = await firstHoldingHouse()
    calls.all.mockRejectedValueOnce(REFUSAL)
    const earlier = withMemoryFallback(first)
    expect(await earlier.all()).toEqual([])

    const later = withMemoryFallback(first)

    expect(await later.all()).toEqual([HOUSE])
    expect(await later.get(HOUSE.id)).toEqual(HOUSE)
    expect(await earlier.all()).toEqual([])
    expect(countsOf(calls)).toEqual({ ...NO_CALLS, all: 2, get: 1 })
  })
})
