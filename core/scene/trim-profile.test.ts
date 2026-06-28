import { describe, expect, it } from 'vitest'
import { trimProfileSection } from './trim-profile'

const HEIGHT_MM = 140
const PROJECTION_MM = 90

const radiusFrom =
  (center: { x: number; y: number }) =>
  (point: { x: number; y: number }): number =>
    Math.hypot(point.x - center.x, point.y - center.y)

describe('trimProfileSection', () => {
  it('resolves a flat profile as a closed rectangle of line segments', () => {
    const section = trimProfileSection('flat', HEIGHT_MM, PROJECTION_MM)

    expect(section.start).toEqual({ x: 0, y: 0 })
    expect(section.segments.every((segment) => segment.kind === 'line')).toBe(true)
    // The outline spans the full stock box: projection out from the wall, height up it.
    const xs = section.segments.map((segment) => segment.to.x)
    const ys = section.segments.map((segment) => segment.to.y)
    expect(Math.max(...xs)).toBe(PROJECTION_MM)
    expect(Math.max(...ys)).toBe(HEIGHT_MM)
    // It returns to the wall face, closing the contour.
    const last = section.segments.at(-1)
    expect(last?.to).toEqual({ x: 0, y: 0 })
  })

  it('resolves an ovolo profile with a convex quarter-round front face', () => {
    const section = trimProfileSection('ovolo', HEIGHT_MM, PROJECTION_MM)

    const arc = section.segments.find((segment) => segment.kind === 'arc')
    expect(arc).toBeDefined()
    if (arc === undefined || arc.kind !== 'arc') return
    // The round-over rolls up to the back-top corner against the wall.
    expect(arc.to).toEqual({ x: 0, y: HEIGHT_MM })
    // A convex face sweeps away from the moulding body.
    expect(arc.clockwise).toBe(false)
    // A genuine circular arc: the start of the round-over and its end share one radius.
    const radius = radiusFrom(arc.center)
    expect(radius({ x: PROJECTION_MM, y: HEIGHT_MM - PROJECTION_MM })).toBeCloseTo(radius(arc.to))
  })

  it('resolves a cove profile with a concave quarter-round front face', () => {
    const section = trimProfileSection('cove', HEIGHT_MM, PROJECTION_MM)

    const arc = section.segments.find((segment) => segment.kind === 'arc')
    expect(arc).toBeDefined()
    if (arc === undefined || arc.kind !== 'arc') return
    // A concave face sweeps toward the moulding body, centered at the front-top corner.
    expect(arc.clockwise).toBe(true)
    expect(arc.center).toEqual({ x: PROJECTION_MM, y: HEIGHT_MM })
    const radius = radiusFrom(arc.center)
    expect(radius({ x: PROJECTION_MM, y: HEIGHT_MM - PROJECTION_MM })).toBeCloseTo(radius(arc.to))
  })
})
