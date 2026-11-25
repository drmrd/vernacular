import { describe, it, expect, vi, afterEach } from 'vitest'
import { version } from '../package.json'
import { IndexedDbProjectIndex, InMemoryProjectIndex, hasSwitchedToMemory } from '../storage'
import { sampleRecord } from '../storage/project-index/project-record-test-kit'
import { createSessionPorts, createTemporarySessionPorts } from './create-session-ports'
import { resolveProjectStorage } from './resolve-project-store'

vi.mock('./resolve-project-store', async () => {
  const storage = await import('../storage')
  return {
    resolveProjectStorage: vi.fn(async () => ({
      store: new storage.InMemoryProjectStore(),
      assets: new storage.InMemoryAssetCache(),
    })),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the ports that the builder gives', () => {
  it('the temporary ports keep their index in memory, apart from the index of any other call', async () => {
    const first = createTemporarySessionPorts().ports
    const second = createTemporarySessionPorts().ports

    await first.index.put(sampleRecord())

    expect(first.index).toBeInstanceOf(InMemoryProjectIndex)
    expect(second.index).toBeInstanceOf(InMemoryProjectIndex)
    expect(await first.index.all()).toEqual([sampleRecord()])
    expect(await second.index.all()).toEqual([])
  })

  it('the build of the ports is the version of the package', () => {
    expect(createTemporarySessionPorts().ports.build).toBe(version)
  })

  it('the durable ports answer from memory, with one warning, when the browser index cannot be read', async () => {
    await expect(new IndexedDbProjectIndex().all()).rejects.toBeInstanceOf(Error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { ports } = await createSessionPorts()

    expect(await ports.index.all()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.some((argument) => argument instanceof Error)).toBe(true)
  })

  it('the index of the durable ports says that it switched after the read that failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { ports } = await createSessionPorts()

    await ports.index.all()

    expect(hasSwitchedToMemory(ports.index)).toBe(true)
  })

  it('rejects when the lookup of the storage rejects', async () => {
    const failure = new Error('no storage backend')
    vi.mocked(resolveProjectStorage).mockRejectedValueOnce(failure)

    await expect(createSessionPorts()).rejects.toBe(failure)
  })

  it('the workspace of the temporary ports does not outlive the tab', () => {
    expect(createTemporarySessionPorts().ports.workspace.durable).toBe(false)
  })
})
