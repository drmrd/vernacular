import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { reconcileIndex } from '..'
import { placeSound, rebuildPorts, soundRecordOf } from './rebuild-test-kit'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('calls of the rebuild that overlap', () => {
  it('calls that share one run each get their own list: a change to one list leaves the other as it was', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const list = vi.spyOn(ports.workspace, 'list')

    const [one, two] = await Promise.all([reconcileIndex(ports), reconcileIndex(ports)])
    expect(list).toHaveBeenCalledTimes(1)
    one.push(sampleRecord({ id: 'pushed' }))

    expect(two).not.toBe(one)
    expect(two).toEqual([soundRecordOf('a'), soundRecordOf('b')])
  })

  it('two ports objects over one store and one index make two runs, each with its own listing, and give equal lists', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const other = rebuildPorts({ root: ports.root, index: ports.index })
    const lists = [vi.spyOn(ports.workspace, 'list'), vi.spyOn(other.workspace, 'list')]

    const [one, two] = await Promise.all([reconcileIndex(ports), reconcileIndex(other)])

    expect(lists.map((list) => list.mock.calls.length)).toEqual([1, 1])
    expect(one).toEqual([soundRecordOf('a'), soundRecordOf('b')])
    expect(two).toEqual(one)
  })
})

describe('a project that arrives during a run', () => {
  it('a project stored and recorded after the listing keeps its record in the index, and the result of that run leaves it out', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const realList = ports.workspace.list.bind(ports.workspace)
    vi.spyOn(ports.workspace, 'list').mockImplementationOnce(async () => {
      const listed = await realList()
      await placeSound(ports, ['late'])
      await ports.index.put(soundRecordOf('late'))
      return listed
    })

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])

    expect(await ports.index.get('late')).toEqual(soundRecordOf('late'))
  })
})
