import { describe, it, expect } from 'vitest'
import { drawSurfacePaint } from './draw-surface-paint'
import type { SurfacePaintLayer } from './draw-surface-paint'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { Viewport } from './viewport'
import { colorFromHex, solidTreatment } from '../../core'
import type { Point, SurfaceTreatment } from '../../core'

// A muted sage finish; colorFromHex normalizes so its srgbHex round-trips to the
// same lowercase hex, which is the value the painted band's stroke style carries.
const SAGE_HEX = '#9aa583'

// The brass accent the active-surface highlight and the new face highlight both stroke.
const ACCENT_HEX = '#b5894a'

// The shared viewport: the world origin maps to the screen origin (no pan).
const VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

/**
 * The screen endpoints of the face-offset band for one side of `sampleWall`.
 *
 * The band runs parallel to the wall, offset by half the wall thickness along the
 * perpendicular of the wall direction: `dir = unit(start -> end)`,
 * `perpendicular = { x: -dir.y, y: dir.x }`, and
 * `reach = (side === 'left' ? 1 : -1) * thickness * 0.5`. The band endpoints are
 * `start + perpendicular * reach` and `end + perpendicular * reach`, in world space,
 * projected with the layer viewport.
 */
function faceBand(side: 'left' | 'right'): { from: Point; to: Point } {
  const { start, end, thickness } = sampleWall
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const dir = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
  const perpendicular = { x: -dir.y, y: dir.x }
  const reach = (side === 'left' ? 1 : -1) * thickness * 0.5
  const offset = { x: perpendicular.x * reach, y: perpendicular.y * reach }
  return {
    from: worldToScreen({ x: start.x + offset.x, y: start.y + offset.y }, VIEWPORT),
    to: worldToScreen({ x: end.x + offset.x, y: end.y + offset.y }, VIEWPORT),
  }
}

/** Whether a recorded segment runs between the two endpoints of `band` (either direction). */
function matchesBand(
  segment: { from: [number, number]; to: [number, number] },
  band: { from: Point; to: Point },
): boolean {
  const at = (a: [number, number], p: Point): boolean => a[0] === p.x && a[1] === p.y
  return (
    (at(segment.from, band.from) && at(segment.to, band.to)) ||
    (at(segment.from, band.to) && at(segment.to, band.from))
  )
}

/** A treatment resolver that paints every wall face with the sage finish. */
const paintEveryFace = (): SurfaceTreatment => solidTreatment(colorFromHex(SAGE_HEX), 'matte')

/** A treatment resolver that leaves every wall face unpainted. */
const paintNothing = (): undefined => undefined

/** The single-wall layer the cases share; each case overrides what differs. */
function layer(overrides: Partial<SurfacePaintLayer> = {}): SurfacePaintLayer {
  return {
    walls: [sampleWall],
    treatmentForFace: paintNothing,
    activeSurface: null,
    viewport: VIEWPORT,
    ...overrides,
  }
}

describe('drawSurfacePaint', () => {
  it('draws a painted wall face as a band in the treatment color', () => {
    const recorder = recordingContext()

    drawSurfacePaint(recorder.ctx, layer({ treatmentForFace: paintEveryFace }))

    expect(recorder.segments.some((segment) => segment.style === SAGE_HEX)).toBe(true)
  })

  it('draws nothing for a wall whose faces are all unpainted', () => {
    const recorder = recordingContext()

    drawSurfacePaint(recorder.ctx, layer({ treatmentForFace: paintNothing }))

    // No painted faces means no bands: holding this independent of the left/right
    // perpendicular-offset convention the band routine will choose.
    expect(recorder.segments).toHaveLength(0)
  })

  it('adds a highlight stroke for the active surface that an unpainted plan otherwise lacks', () => {
    const withoutHighlight = recordingContext()
    drawSurfacePaint(withoutHighlight.ctx, layer({ treatmentForFace: paintNothing }))

    const withHighlight = recordingContext()
    drawSurfacePaint(
      withHighlight.ctx,
      layer({
        treatmentForFace: paintNothing,
        activeSurface: { kind: 'wall-face', wallId: 'a', side: 'left' },
      }),
    )

    // With no paint bands, the active-surface highlight is the only thing that can
    // stroke a segment, so it appears solely when an active surface is supplied.
    expect(withoutHighlight.segments).toHaveLength(0)
    expect(withHighlight.segments.length).toBeGreaterThan(0)

    // The highlight is an accent distinct from a face's treatment color: when both
    // a painted band and the highlight are present, the highlight stroke uses a
    // style other than the band's treatment color (without pinning the accent hex).
    const both = recordingContext()
    drawSurfacePaint(
      both.ctx,
      layer({
        treatmentForFace: paintEveryFace,
        activeSurface: { kind: 'wall-face', wallId: 'a', side: 'left' },
      }),
    )
    expect(both.segments.some((segment) => segment.style !== SAGE_HEX)).toBe(true)
  })

  it('strokes the highlighted surface as a face band along the left side of its wall', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({ highlightedSurface: { kind: 'wall-face', wallId: 'a', side: 'left' } }),
    )

    // The left face band runs at world y = +57 (half of the 114 mm thickness), which
    // projects to screen y = -4.56 at the default scale: from (0, -4.56) to (80, -4.56).
    const band = faceBand('left')
    expect(
      recorder.segments.some(
        (segment) => segment.style === ACCENT_HEX && matchesBand(segment, band),
      ),
    ).toBe(true)
  })

  it('strokes the highlighted surface on the opposite side for a right-face ref', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({ highlightedSurface: { kind: 'wall-face', wallId: 'a', side: 'right' } }),
    )

    // The right face band mirrors the left across the wall axis: world y = -57, which
    // projects to screen y = +4.56: from (0, 4.56) to (80, 4.56), distinct from the left.
    const right = faceBand('right')
    const left = faceBand('left')
    expect(
      recorder.segments.some(
        (segment) => segment.style === ACCENT_HEX && matchesBand(segment, right),
      ),
    ).toBe(true)
    expect(
      recorder.segments.some(
        (segment) => segment.style === ACCENT_HEX && matchesBand(segment, left),
      ),
    ).toBe(false)
  })

  it('draws no face highlight band when no surface is highlighted', () => {
    const omitted = recordingContext()
    drawSurfacePaint(omitted.ctx, layer())

    const nulled = recordingContext()
    drawSurfacePaint(nulled.ctx, layer({ highlightedSurface: null }))

    // With no highlighted surface and no active surface, the accent brass is never
    // stroked, so neither the left nor right face band appears.
    const left = faceBand('left')
    const right = faceBand('right')
    for (const recorder of [omitted, nulled]) {
      expect(
        recorder.segments.some(
          (segment) =>
            segment.style === ACCENT_HEX &&
            (matchesBand(segment, left) || matchesBand(segment, right)),
        ),
      ).toBe(false)
    }
  })

  it('draws the highlight band for a highlighted surface even when that face is unpainted', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({
        treatmentForFace: paintNothing,
        highlightedSurface: { kind: 'wall-face', wallId: 'a', side: 'left' },
      }),
    )

    // The highlight tracks selection, not treatment: an unpainted face still lights up.
    const band = faceBand('left')
    expect(
      recorder.segments.some(
        (segment) => segment.style === ACCENT_HEX && matchesBand(segment, band),
      ),
    ).toBe(true)
  })
})
