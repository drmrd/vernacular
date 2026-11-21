import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryProjectIndex } from './in-memory-project-index'
import { IndexedDbProjectIndex } from './indexeddb-project-index'
import type { ProjectIndex } from './project-index'
import {
  failingIndex,
  holdWrites,
  sampleRecord,
  watch,
  type ReadMethod,
} from './project-record-test-kit'
import {
  INDEX_READ_WAIT_MS,
  INDEX_WRITE_WAIT_MS,
  hasSwitchedToMemory,
  withMemoryFallback,
} from './with-memory-fallback'

const HOUSE = sampleRecord()
const FAILURE = new Error('the first index failed')
const READS: readonly ReadMethod[] = ['all', 'get']

/** The ways in which a read of the first index fails at once, and how a test makes it fail. */
const FAILED_READS: readonly (readonly [
  string,
  (first: ProjectIndex, read: ReadMethod) => void,
])[] = [
  ['rejects', (first, read) => vi.spyOn(first, read).mockRejectedValue(FAILURE)],
  [
    'throws',
    (first, read) =>
      vi.spyOn(first, read).mockImplementation(() => {
        throw FAILURE
      }),
  ],
]

const AT_ONCE = READS.flatMap((read) =>
  FAILED_READS.map(([way, fail]) => [read, way, fail] as const),
)

/** Indexes that `withMemoryFallback` did not build. */
const OTHER_INDEXES: readonly (readonly [string, () => ProjectIndex])[] = [
  ['an in-memory index', () => new InMemoryProjectIndex()],
  ['the browser index', () => new IndexedDbProjectIndex()],
  ['an index that rejects every call', () => failingIndex()],
]

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function readOf(index: ProjectIndex, read: ReadMethod): Promise<unknown> {
  return read === 'all' ? index.all() : index.get(HOUSE.id)
}

describe('whether a fall-back has switched to memory', () => {
  it('says false while the first index answers, also after a write that rejected and after a write that got no answer in time', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    const index = withMemoryFallback(first)
    expect(hasSwitchedToMemory(index)).toBe(false)
    await index.put(HOUSE)
    expect(await index.all()).toEqual([HOUSE])
    expect(hasSwitchedToMemory(index)).toBe(false)

    vi.spyOn(first, 'put').mockRejectedValueOnce(FAILURE)
    await expect(index.put(HOUSE)).rejects.toBe(FAILURE)
    expect(hasSwitchedToMemory(index)).toBe(false)

    vi.spyOn(first, 'remove').mockReturnValueOnce(new Promise<void>(() => undefined))
    const late = watch(index.remove(HOUSE.id))
    await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS)
    expect(late().status).toBe('rejected')
    expect(hasSwitchedToMemory(index)).toBe(false)
  })

  it.each(AT_ONCE)('says true after a read of %s that %s', async (read, _way, fail) => {
    const first = new InMemoryProjectIndex()
    fail(first, read)
    const index = withMemoryFallback(first)

    await readOf(index, read)

    expect(hasSwitchedToMemory(index)).toBe(true)
  })

  it.each(READS)(
    'says false while a read of %s waits for its answer, and true once it got no answer in time',
    async (read) => {
      vi.useFakeTimers()
      const first = new InMemoryProjectIndex()
      vi.spyOn(first, read).mockReturnValue(new Promise<never>(() => undefined))
      const index = withMemoryFallback(first)

      const waiting = watch(readOf(index, read))
      await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - 1)
      expect([waiting().status, hasSwitchedToMemory(index)]).toEqual(['pending', false])
      await vi.advanceTimersByTimeAsync(1)

      expect([waiting().status, hasSwitchedToMemory(index)]).toEqual(['answered', true])
    },
  )
})

describe('where a put goes after the answer', () => {
  it('a put that is called right after a false answer reaches the first index, also when the switch comes while it is in flight', async () => {
    const first = new InMemoryProjectIndex()
    const held = holdWrites(first, 'put')
    vi.spyOn(first, 'get').mockRejectedValue(FAILURE)
    const index = withMemoryFallback(first)

    expect(hasSwitchedToMemory(index)).toBe(false)
    const put = index.put(HOUSE)
    expect(await index.get(HOUSE.id)).toBeUndefined()
    expect(hasSwitchedToMemory(index)).toBe(true)
    held.answerOldest()

    await expect(put).resolves.toBeUndefined()
    expect(await first.all()).toEqual([HOUSE])
    expect(await index.all()).toEqual([])
  })

  it('a put that is called right after a true answer never reaches the first index', async () => {
    const first = new InMemoryProjectIndex()
    vi.spyOn(first, 'all').mockRejectedValue(FAILURE)
    const firstPut = vi.spyOn(first, 'put')
    const index = withMemoryFallback(first)
    await index.all()

    expect(hasSwitchedToMemory(index)).toBe(true)
    await index.put(HOUSE)

    expect(firstPut).not.toHaveBeenCalled()
    expect(await index.get(HOUSE.id)).toEqual(HOUSE)
  })
})

describe('indexes with no memory to switch to', () => {
  it.each(OTHER_INDEXES)('says false for %s, also after a read', async (_kind, create) => {
    const index = create()
    expect(hasSwitchedToMemory(index)).toBe(false)

    await index.all().catch(() => undefined)

    expect(hasSwitchedToMemory(index)).toBe(false)
  })

  it('two fall-backs over one first index answer each for itself', async () => {
    const first = new InMemoryProjectIndex()
    vi.spyOn(first, 'all').mockRejectedValueOnce(FAILURE)
    const switching = withMemoryFallback(first)
    const other = withMemoryFallback(first)

    await switching.all()
    await other.all()

    expect([hasSwitchedToMemory(switching), hasSwitchedToMemory(other)]).toEqual([true, false])
  })

  it('the answer calls nothing on the first index and starts no timer, before and after the switch', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    const index = withMemoryFallback(first)
    const all = vi.spyOn(first, 'all')
    const calls = [all, vi.spyOn(first, 'get'), vi.spyOn(first, 'put'), vi.spyOn(first, 'remove')]
    const timers = vi.getTimerCount()

    expect(hasSwitchedToMemory(index)).toBe(false)
    expect(calls.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0])
    expect(vi.getTimerCount()).toBe(timers)

    all.mockRejectedValue(FAILURE)
    await index.all()
    calls.forEach((spy) => spy.mockClear())
    const timersAfterSwitch = vi.getTimerCount()
    expect(hasSwitchedToMemory(index)).toBe(true)
    expect(calls.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0])
    expect(vi.getTimerCount()).toBe(timersAfterSwitch)
  })
})
