import { describe, it, expect } from 'vitest'
import { drawSurfacePaint } from './draw-surface-paint'
import type { SurfacePaintLayer } from './draw-surface-paint'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_SCALE } from './viewport'
import { colorFromHex, solidTreatment } from '../../core'
import type { SurfaceTreatment } from '../../core'

// A muted sage finish; colorFromHex normalizes so its srgbHex round-trips to the
// same lowercase hex, which is the value the painted band's stroke style carries.
const SAGE_HEX = '#9aa583'

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
    viewport: { scale: DEFAULT_PLAN_SCALE },
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
})
