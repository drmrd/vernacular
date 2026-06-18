import { describe, expect, it, vi, afterEach } from 'vitest'

import { createFurnitureModelCache } from './furniture-model-cache'

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createFurnitureModelCache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads a model to ready and notifies', async () => {
    const template = { tag: 'sofa-model' }
    const cache = createFurnitureModelCache({
      resolve: async () => new Uint8Array([1]),
      parse: async () => template,
      dispose: () => {},
    })
    const ref = { scope: 'user', contentHash: 'h1' } as const
    let changes = 0
    cache.onChange(() => {
      changes += 1
    })
    cache.request(ref)
    expect(cache.get('h1')?.status).toBe('loading')
    await flushMicrotasks()
    expect(cache.get('h1')).toEqual({ status: 'ready', template })
    expect(changes).toBe(1)
  })

  it('deduplicates concurrent requests for the same hash', async () => {
    let resolves = 0
    const cache = createFurnitureModelCache({
      resolve: async () => {
        resolves += 1
        return new Uint8Array([1])
      },
      parse: async () => ({ tag: 'model' }),
      dispose: () => {},
    })
    const ref = { scope: 'user', contentHash: 'h1' } as const
    cache.request(ref)
    cache.request(ref)
    await flushMicrotasks()
    expect(resolves).toBe(1)
  })

  it('settles a failed load to failed, warns, and does not break other loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createFurnitureModelCache({
      resolve: async (ref) => (ref.contentHash === 'bad' ? undefined : new Uint8Array([1])),
      parse: async () => ({ tag: 'model' }),
      dispose: () => {},
    })
    cache.request({ scope: 'user', contentHash: 'bad' })
    cache.request({ scope: 'user', contentHash: 'good' })
    await flushMicrotasks()
    expect(cache.get('bad')?.status).toBe('failed')
    expect(cache.get('good')?.status).toBe('ready')
    expect(warn).toHaveBeenCalled()
  })

  it('caps concurrent parses', async () => {
    const gates: Array<() => void> = []
    let active = 0
    let maxActive = 0
    const cache = createFurnitureModelCache({
      resolve: async () => new Uint8Array([1]),
      parse: () =>
        new Promise((resolve) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          gates.push(() => {
            active -= 1
            resolve({ tag: 'model' })
          })
        }),
      dispose: () => {},
      maxConcurrent: 2,
    })
    for (const hash of ['a', 'b', 'c', 'd']) cache.request({ scope: 'user', contentHash: hash })
    await flushMicrotasks()
    expect(maxActive).toBe(2)
    while (gates.length > 0) {
      const gate = gates.shift()
      if (gate) gate()
      await flushMicrotasks()
    }
    expect(cache.get('d')?.status).toBe('ready')
  })

  it('evicts and disposes an unreferenced template past the cap', async () => {
    const disposed: Array<{ tag: string }> = []
    const t1 = { tag: 'a' }
    const t2 = { tag: 'b' }
    const templates = [t1, t2]
    const cache = createFurnitureModelCache({
      resolve: async () => new Uint8Array([1]),
      parse: async () => templates.shift() ?? t2,
      dispose: (model) => {
        disposed.push(model)
      },
      maxTemplates: 1,
    })
    cache.request({ scope: 'user', contentHash: 'a' })
    await flushMicrotasks()
    cache.request({ scope: 'user', contentHash: 'b' })
    await flushMicrotasks()
    cache.markLiveHashes(['b'])
    expect(disposed).toContain(t1)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')?.status).toBe('ready')
  })

  it('drops a late completion after dispose and frees templates', async () => {
    let release: (model: { tag: string }) => void = () => {}
    const t = { tag: 'x' }
    const disposed: Array<{ tag: string }> = []
    const cache = createFurnitureModelCache({
      resolve: async () => new Uint8Array([1]),
      parse: () =>
        new Promise((resolve) => {
          release = resolve
        }),
      dispose: (model) => {
        disposed.push(model)
      },
    })
    let changesAfterDispose = 0
    cache.request({ scope: 'user', contentHash: 'h' })
    await flushMicrotasks()
    cache.onChange(() => {
      changesAfterDispose += 1
    })
    cache.dispose()
    release(t) // late parse completion, arrives after dispose
    await flushMicrotasks()
    expect(cache.get('h')?.status).not.toBe('ready')
    expect(changesAfterDispose).toBe(0)
  })
})
