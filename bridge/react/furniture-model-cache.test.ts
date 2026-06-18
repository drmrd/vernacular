import { describe, expect, it } from 'vitest'

import { createFurnitureModelCache } from './furniture-model-cache'

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createFurnitureModelCache', () => {
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
})
