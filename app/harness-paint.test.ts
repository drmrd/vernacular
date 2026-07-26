import { describe, it, expect } from 'vitest'
import { colorFromHex, solidTreatment, surfaceKey } from '../core'
import { resolveHarnessPaint } from './harness-paint'

const floorKey = surfaceKey({ kind: 'floor', floorId: 'demo' })

describe('resolveHarnessPaint', () => {
  it('resolves an absent paint param to undefined so the harness stays unpainted', () => {
    expect(resolveHarnessPaint(null)).toBeUndefined()
  })

  it('resolves a non-hex, non-demo string to undefined', () => {
    expect(resolveHarnessPaint('nonsense')).toBeUndefined()
  })

  it('resolves a five-digit string to undefined because it is short of six hex digits', () => {
    expect(resolveHarnessPaint('12345')).toBeUndefined()
  })

  it('resolves a six-character string with a non-hex digit to undefined', () => {
    expect(resolveHarnessPaint('12345g')).toBeUndefined()
  })

  it('resolves a bare six-digit hex swatch to a single-entry floor paint store', () => {
    expect(resolveHarnessPaint('808080')).toEqual({
      [floorKey]: solidTreatment(colorFromHex('#808080'), 'matte'),
    })
  })

  it('resolves an upper-case hex swatch case-insensitively', () => {
    expect(resolveHarnessPaint('CC6633')?.[floorKey]).toEqual(
      solidTreatment(colorFromHex('#cc6633'), 'matte'),
    )
  })

  it('resolves demo to the five-surface demo paint store: the shell floor plus all four walls', () => {
    const store = resolveHarnessPaint('demo')

    expect(store).toBeDefined()
    expect(Object.keys(store ?? {})).toHaveLength(5)
    expect(store?.[floorKey]).toEqual(solidTreatment(colorFromHex('#cc6633'), 'matte'))

    for (const wallId of ['south', 'east', 'north', 'west']) {
      const wallKey = surfaceKey({ kind: 'wall-face', wallId, side: 'right' })
      expect(store?.[wallKey]).toEqual(solidTreatment(colorFromHex('#3f7f5f'), 'matte'))
    }
  })
})
