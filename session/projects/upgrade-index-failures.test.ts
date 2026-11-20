import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { InMemoryProjectIndex, withMemoryFallback } from '../../storage'
import type { ProjectIndex } from '../../storage'
import {
  clearLegacyActiveProjectId,
  legacyActiveProjectIdIsStored,
  plantLegacyActiveProjectId,
} from '../../storage/active-project/legacy-active-project-id-test-kit'
import { gatePuts } from '../../storage/project-index/project-record-test-kit'
import {
  INDEX_READ_WAIT_MS,
  INDEX_WRITE_WAIT_MS,
} from '../../storage/project-index/with-memory-fallback'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  holdReadOf,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  stallPuts,
  stepWarnings,
} from './rebuild-test-kit'

const READ_FAILURE = new Error('the browser index cannot be read')

let consoleWarn: MockInstance<typeof console.warn>

beforeEach(() => {
  clearLegacyActiveProjectId()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  clearLegacyActiveProjectId()
})

/** Durable ports over `index` whose store holds a sound project under each of `ids`. */
async function upgradePortsOver(index: ProjectIndex, ids: readonly string[]): Promise<TestPorts> {
  const ports = rebuildPorts({ durable: true, index })
  await placeSound(ports, ids)
  return ports
}

/** The record of the sound project `id` with the latest use: the present time of the ports. */
function markedRecordOf(ports: TestPorts, id: string) {
  return soundRecordOf(id, { lastUsedAt: ports.now().toISOString() })
}

/** A first index whose read of all records rejects, and ports over its memory fall-back. */
async function switchingAtTheRead(ids: readonly string[]) {
  const first = new InMemoryProjectIndex()
  const read = vi.spyOn(first, 'all').mockRejectedValue(READ_FAILURE)
  const firstPut = vi.spyOn(first, 'put')
  const ports = await upgradePortsOver(withMemoryFallback(first), ids)
  return { first, read, firstPut, ports }
}

describe('a tab whose index switches to memory before the put of the remembered project', () => {
  it('an index whose read rejects gives the remembered project a record with no mark, the first index gets nothing, the remembered id stays, and a second call changes nothing', async () => {
    const { firstPut, ports } = await switchingAtTheRead(['b'])
    plantLegacyActiveProjectId('b')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('b')])
    expect(firstPut).not.toHaveBeenCalled()
    expect(legacyActiveProjectIdIsStored()).toBe(true)

    const put = vi.spyOn(ports.index, 'put')
    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('b')])
    expect(put).not.toHaveBeenCalled()
    expect(await ports.index.get('b')).toEqual(soundRecordOf('b'))
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('an index whose read gives no answer within the read limit gives the remembered project a record with no mark, the first index gets nothing, and the remembered id stays', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    vi.spyOn(first, 'all').mockReturnValue(new Promise<never>(() => undefined))
    const firstPut = vi.spyOn(first, 'put')
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')

    const rebuilding = reconcileIndex(ports)
    await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS)

    expect(await rebuilding).toEqual([soundRecordOf('b')])
    expect(firstPut).not.toHaveBeenCalled()
    expect(legacyActiveProjectIdIsStored()).toBe(true)
    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('b')])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('after such a start, new ports over the same store and a sound index mark the project and remove the remembered id', async () => {
    const { first, read, ports } = await switchingAtTheRead(['b'])
    plantLegacyActiveProjectId('b')
    await reconcileIndex(ports)
    read.mockRestore()

    const nextStart = rebuildPorts({
      durable: true,
      root: ports.root,
      index: withMemoryFallback(first),
    })

    expect(await reconcileIndex(nextStart)).toEqual([markedRecordOf(nextStart, 'b')])
    expect(await first.all()).toEqual([markedRecordOf(nextStart, 'b')])
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a switch during the run, before the put of the remembered project, sends its record to memory with no mark, and the remembered id stays', async () => {
    const first = new InMemoryProjectIndex()
    vi.spyOn(first, 'get').mockRejectedValue(READ_FAILURE)
    const ports = await upgradePortsOver(withMemoryFallback(first), ['a', 'b'])
    plantLegacyActiveProjectId('b')
    const read = holdReadOf(ports, 'b')

    const rebuilding = reconcileIndex(ports)
    await vi.waitFor(() => expect(read.started()).toBe(true))
    expect(await ports.index.get('b')).toBeUndefined()
    read.release()

    expect(await rebuilding).toEqual([soundRecordOf('a'), soundRecordOf('b')])
    expect(await first.all()).toEqual([soundRecordOf('a')])
    expect(await ports.index.all()).toEqual([soundRecordOf('b')])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('in a tab that switched, a remembered id that the store does not hold stays', async () => {
    const { ports } = await switchingAtTheRead(['a'])
    plantLegacyActiveProjectId('gone')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])

    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })
})

describe('the marked put and the remembered id', () => {
  it('a switch while the marked put is in flight: the first index holds the marked record, memory does not, and the remembered id is gone', async () => {
    const first = new InMemoryProjectIndex()
    const puts = gatePuts(first)
    vi.spyOn(first, 'get').mockRejectedValue(READ_FAILURE)
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(ports, 'b')

    const rebuilding = reconcileIndex(ports)
    await vi.waitFor(() => expect(puts.started()).toBe(1))
    expect(await ports.index.get('b')).toBeUndefined()
    expect(legacyActiveProjectIdIsStored()).toBe(true)
    puts.endAllPuts()

    expect(await rebuilding).toEqual([marked])
    expect(await first.all()).toEqual([marked])
    expect(await ports.index.all()).toEqual([])
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a marked put that rejects keeps the remembered id, keeps the mark in the result, and counts one failed step; the next call marks again and removes the remembered id', async () => {
    const first = new InMemoryProjectIndex()
    const error = new Error('the browser index is full')
    vi.spyOn(first, 'put').mockRejectedValueOnce(error)
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(ports, 'b')

    expect(await reconcileIndex(ports)).toEqual([marked])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
    const warnings = stepWarnings(consoleWarn.mock.calls)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(1)
    expect(warnings[0]).toContain(error)

    expect(await reconcileIndex(ports)).toEqual([marked])
    expect(await first.all()).toEqual([marked])
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a marked put that gives no answer within the write limit keeps the remembered id and the mark in the result', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    stallPuts(first, (id) => id === 'b')
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')

    const rebuilding = reconcileIndex(ports)
    await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS)

    expect(await rebuilding).toEqual([markedRecordOf(ports, 'b')])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })
})

describe('reads that fail with no switch', () => {
  it('an index with no fall-back whose read rejects and whose puts answer gets no mark, and the remembered id stays', async () => {
    const index = new InMemoryProjectIndex()
    vi.spyOn(index, 'all').mockRejectedValue(READ_FAILURE)
    const ports = await upgradePortsOver(index, ['b'])
    plantLegacyActiveProjectId('b')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('b')])

    expect(await index.get('b')).toEqual(soundRecordOf('b'))
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('a listing that rejects leaves the remembered id', async () => {
    const ports = await upgradePortsOver(withMemoryFallback(new InMemoryProjectIndex()), ['b'])
    plantLegacyActiveProjectId('b')
    vi.spyOn(ports.workspace, 'list').mockRejectedValue(new Error('the store cannot be listed'))

    expect(await reconcileIndex(ports)).toEqual([])

    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })
})
