import { describe, expect, it } from 'vitest'
import { affectedLayers, layerOf, LAYERS } from './layers.mjs'

describe('LAYERS', () => {
  it('lists the seven layers from the lowest to the highest', () => {
    expect([...LAYERS]).toEqual(['core', 'storage', 'session', 'engine', 'bridge', 'editor', 'app'])
  })
})

describe('layerOf', () => {
  it('maps a path to its top-level layer', () => {
    expect(layerOf('engine/renderer/create-renderer.ts')).toBe('engine')
    expect(layerOf('core/index.ts')).toBe('core')
    expect(layerOf('session/index.ts')).toBe('session')
  })

  it('returns null for paths outside the layer stack', () => {
    expect(layerOf('scripts/ci/decide.mjs')).toBe(null)
    expect(layerOf('README.md')).toBe(null)
  })
})

describe('affectedLayers', () => {
  it('returns the changed layer and every layer above it', () => {
    expect(affectedLayers(['engine'])).toEqual(['engine', 'bridge', 'editor', 'app'])
    expect(affectedLayers(['editor'])).toEqual(['editor', 'app'])
    expect(affectedLayers(['session'])).toEqual(['session', 'engine', 'bridge', 'editor', 'app'])
  })

  it('a core change pulls in the whole stack', () => {
    expect(affectedLayers(['core'])).toEqual([...LAYERS])
  })

  it('unions multiple changed layers to the lowest suffix', () => {
    expect(affectedLayers(['app', 'storage'])).toEqual([
      'storage',
      'session',
      'engine',
      'bridge',
      'editor',
      'app',
    ])
  })

  it('ignores unknown layers and returns empty for none', () => {
    expect(affectedLayers([])).toEqual([])
    expect(affectedLayers(['nonsense'])).toEqual([])
  })
})
