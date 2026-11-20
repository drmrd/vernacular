import { describe, expect, it } from 'vitest'
import { harnessStateKey } from './scene-harness-state-key'

describe('harnessStateKey', () => {
  it('gives equal keys for objects built with entries in a different order', () => {
    const forward = { scene: 'shell', environment: { site: { x: 1, y: 2 } } }
    const reverse = { environment: { site: { y: 2, x: 1 } }, scene: 'shell' }

    expect(harnessStateKey(reverse)).toBe(harnessStateKey(forward))
  })

  it('gives different keys for different scenes', () => {
    expect(harnessStateKey({ scene: 'shell' })).not.toBe(harnessStateKey({ scene: 'junctions' }))
  })

  it('gives different keys when one nested value differs', () => {
    const base = { scene: 'shell', environment: { site: { x: 1, y: 2 } } }
    const changed = { scene: 'shell', environment: { site: { x: 1, y: 3 } } }

    expect(harnessStateKey(changed)).not.toBe(harnessStateKey(base))
  })

  it('gives the same key whether a prop is undefined or absent', () => {
    expect(harnessStateKey({ scene: 'shell', environment: undefined })).toBe(
      harnessStateKey({ scene: 'shell' }),
    )
  })

  it('keeps the order of an array significant', () => {
    expect(harnessStateKey({ values: [1, 2, 3] })).not.toBe(harnessStateKey({ values: [3, 2, 1] }))
  })
})
