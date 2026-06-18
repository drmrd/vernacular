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
})
