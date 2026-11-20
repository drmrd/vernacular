import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryProjectIndex, withMemoryFallback } from '../../storage'
import {
  clearLegacyActiveProjectId,
  legacyActiveProjectIdIsStored,
  plantLegacyActiveProjectId,
  storedLegacyActiveProjectId,
} from '../../storage/active-project/legacy-active-project-id-test-kit'
import { gatePuts, sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { INDEX_WRITE_WAIT_MS } from '../../storage/project-index/with-memory-fallback'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  EARLIER_CHANGE,
  USED_AT,
  holdPutOf,
  markedRecordOf,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  upgradePortsOver,
} from './rebuild-test-kit'

const READ_FAILURE = new Error('the browser index cannot be read')
const PUT_FAILURE = new Error('the browser index is full')

beforeEach(() => {
  clearLegacyActiveProjectId()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  clearLegacyActiveProjectId()
})

/** Durable ports over a sound in-memory index whose store holds a sound project under each of `ids`. */
function upgradePortsWith(ids: readonly string[]): Promise<TestPorts> {
  return upgradePortsOver(new InMemoryProjectIndex(), ids)
}

describe('a marked put that does not land', () => {
  it('a switch while the marked put is in flight, then a rejection of that put, keeps the remembered id and leaves the first index empty', async () => {
    const first = new InMemoryProjectIndex()
    const puts = gatePuts(first)
    vi.spyOn(first, 'get').mockRejectedValue(READ_FAILURE)
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')

    const rebuilding = reconcileIndex(ports)
    await vi.waitFor(() => expect(puts.started()).toBe(1))
    expect(await ports.index.get('b')).toBeUndefined()
    puts.endOldestPut(PUT_FAILURE)

    expect(await rebuilding).toEqual([markedRecordOf(ports, 'b')])
    expect(await first.all()).toEqual([])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it("another project's put that lands does not remove the remembered id when the marked put rejects", async () => {
    const first = new InMemoryProjectIndex()
    const puts = gatePuts(first)
    const ports = await upgradePortsOver(withMemoryFallback(first), ['a', 'b'])
    plantLegacyActiveProjectId('b')

    const rebuilding = reconcileIndex(ports)
    await vi.waitFor(() => expect(puts.started()).toBe(2))
    puts.endOldestPutOf('a')
    await vi.waitFor(async () => expect(await first.get('a')).toEqual(soundRecordOf('a')))
    expect(legacyActiveProjectIdIsStored()).toBe(true)
    puts.endOldestPutOf('b', PUT_FAILURE)

    expect(await rebuilding).toEqual([soundRecordOf('a'), markedRecordOf(ports, 'b')])
    expect(await first.all()).toEqual([soundRecordOf('a')])
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('a marked put that reaches the write limit and lands later leaves the next call with nothing to change, and the remembered id stays', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    const held = holdPutOf(first, 'b')
    const ports = await upgradePortsOver(withMemoryFallback(first), ['b'])
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(ports, 'b')

    const rebuilding = reconcileIndex(ports)
    await vi.advanceTimersByTimeAsync(INDEX_WRITE_WAIT_MS)
    expect(await rebuilding).toEqual([marked])
    held.release()
    await vi.waitFor(async () => expect(await first.all()).toEqual([marked]))

    const put = vi.spyOn(ports.index, 'put')
    expect(await reconcileIndex(ports)).toEqual([marked])
    expect(put).not.toHaveBeenCalled()
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })
})

describe('the remembered id where no mark is due', () => {
  it('a workspace record under the remembered id whose time of change differs is rebuilt with its own time of use and no mark, and the remembered id stays', async () => {
    const ports = await upgradePortsWith(['b'])
    await ports.index.put(
      sampleRecord({ id: 'b', lastChangedAt: EARLIER_CHANGE, lastUsedAt: USED_AT }),
    )
    plantLegacyActiveProjectId('b')
    const rebuilt = soundRecordOf('b', { lastUsedAt: USED_AT })

    expect(await reconcileIndex(ports)).toEqual([rebuilt])

    expect(await ports.index.get('b')).toEqual(rebuilt)
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('a workspace that is not durable leaves a value that is not a valid id in place', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    plantLegacyActiveProjectId('../current')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])

    expect(storedLegacyActiveProjectId()).toBe('../current')
  })
})

describe('the read of the remembered id', () => {
  it('each run reads the browser storage one time, under one key', async () => {
    const ports = await upgradePortsWith(['a', 'b'])
    plantLegacyActiveProjectId('b')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    await reconcileIndex(ports)
    expect(getItem).toHaveBeenCalledOnce()
    await reconcileIndex(ports)
    expect(getItem).toHaveBeenCalledTimes(2)

    expect(new Set(getItem.mock.calls.map(([key]) => key)).size).toBe(1)
  })
})
