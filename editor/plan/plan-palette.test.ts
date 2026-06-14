import { describe, it, expect } from 'vitest'
import { resolvePlanPalette, DEFAULT_PLAN_PALETTE } from './plan-palette'

describe('resolvePlanPalette', () => {
  it('maps each canvas token to its palette field', () => {
    const vars = new Map<string, string>([
      ['--color-canvas-grid', '#aaa111'],
      ['--color-canvas-wall', '#bbb222'],
      ['--color-canvas-room-fill', '#ccc333'],
      ['--color-canvas-ruler-band', '#ddd444'],
      ['--color-canvas-ruler-tick', '#eee555'],
      ['--color-canvas-ruler-text', '#fff666'],
      ['--color-canvas-selection', '#999777'],
      ['--color-canvas-hover', '#888aaa'],
      ['--color-canvas-preview', '#777bbb'],
      ['--color-canvas-selection-fill', '#666ccc'],
      ['--color-canvas-marquee-fill', 'rgba(1, 2, 3, 0.1)'],
    ])

    const palette = resolvePlanPalette((name) => vars.get(name) ?? '')

    expect(palette).toEqual({
      grid: '#aaa111',
      wall: '#bbb222',
      roomFill: '#ccc333',
      rulerBand: '#ddd444',
      rulerTick: '#eee555',
      rulerText: '#fff666',
      selection: '#999777',
      hover: '#888aaa',
      preview: '#777bbb',
      selectionFill: '#666ccc',
      marqueeFill: 'rgba(1, 2, 3, 0.1)',
    })
  })

  it('falls back to the default palette when a variable reads empty', () => {
    expect(resolvePlanPalette(() => '')).toEqual(DEFAULT_PLAN_PALETTE)
  })
})
