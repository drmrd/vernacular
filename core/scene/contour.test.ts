import { describe, it, expect } from 'vitest'
import type { Point } from '../model/types'
import type { Contour } from './contour'

describe('Contour', () => {
  it('represents a closed rectangle in an opening local frame as line segments', () => {
    const start: Point = { x: -450, y: 0 }
    const rectangle: Contour = {
      start,
      segments: [
        { kind: 'line', to: { x: 450, y: 0 } },
        { kind: 'line', to: { x: 450, y: 2100 } },
        { kind: 'line', to: { x: -450, y: 2100 } },
        { kind: 'line', to: start },
      ],
    }
    expect(rectangle.segments).toHaveLength(4)
    expect(rectangle.segments.every((s) => s.kind === 'line')).toBe(true)
  })

  it('admits an exact arc segment as an additive variant', () => {
    const arc: Contour = {
      start: { x: -450, y: 2100 },
      segments: [
        { kind: 'arc', to: { x: 450, y: 2100 }, center: { x: 0, y: 2100 }, clockwise: false },
        { kind: 'line', to: { x: -450, y: 2100 } },
      ],
    }
    expect(arc.segments[0]?.kind).toBe('arc')
  })
})
