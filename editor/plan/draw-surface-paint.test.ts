import { describe, it, expect } from 'vitest'
import { drawSurfacePaint } from './draw-surface-paint'
import type { SurfacePaintLayer } from './draw-surface-paint'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { Viewport } from './viewport'
import { colorFromHex, effectiveWallThickness, solidTreatment } from '../../core'
import type { OpeningSceneNode, Point, SurfaceTreatment, WallSceneNode } from '../../core'

// A muted sage finish; colorFromHex normalizes so its srgbHex round-trips to the
// same lowercase hex, which is the value the painted band's stroke style carries.
const SAGE_HEX = '#9aa583'

// The brass accent the active-surface highlight and the new face highlight both stroke.
const ACCENT_HEX = '#b5894a'

// The shared viewport: the world origin maps to the screen origin (no pan).
const VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

// Halves a thickness into the perpendicular reach a face band offsets from centerline.
const HALF = 0.5

/**
 * The screen endpoints of a face-offset band for one side of `sampleWall`, offset by
 * `halfThickness` along the perpendicular of the wall direction: `dir = unit(start
 * -> end)`, `perpendicular = { x: -dir.y, y: dir.x }`, and `reach = (side === 'left'
 * ? 1 : -1) * halfThickness`. The band endpoints are `start + perpendicular * reach`
 * and `end + perpendicular * reach`, in world space, projected with the layer
 * viewport. Taking the offset directly, rather than deriving it from a wall's raw
 * thickness, lets a case drive the band from `effectiveWallThickness` instead.
 */
function faceBandAtOffset(
  side: 'left' | 'right',
  halfThickness: number,
): { from: Point; to: Point } {
  const { start, end } = sampleWall
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const dir = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
  const perpendicular = { x: -dir.y, y: dir.x }
  const reach = (side === 'left' ? 1 : -1) * halfThickness
  const offset = { x: perpendicular.x * reach, y: perpendicular.y * reach }
  return {
    from: worldToScreen({ x: start.x + offset.x, y: start.y + offset.y }, VIEWPORT),
    to: worldToScreen({ x: end.x + offset.x, y: end.y + offset.y }, VIEWPORT),
  }
}

/** The face-offset band for one side of `sampleWall`, offset by half its raw thickness. */
function faceBand(side: 'left' | 'right'): { from: Point; to: Point } {
  return faceBandAtOffset(side, sampleWall.thickness * HALF)
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

// The sample wall runs along +x from the world origin, so a distance along it is
// simply an x coordinate and a face band sits at a constant world y.
const WALL_LENGTH_MM = 1000
const BOTH_SIDES = ['left', 'right'] as const

// Screen coordinates come out of a line crossing rather than a direct multiply, so
// a cut band endpoint is compared within a tolerance rather than for exact equality.
const SCREEN_TOLERANCE_PX = 1e-6

/** The screen endpoints of the part of one side's face band between two distances along the wall. */
function faceBandSpan(
  side: 'left' | 'right',
  fromMm: number,
  toMm: number,
): { from: Point; to: Point } {
  const reach = (side === 'left' ? 1 : -1) * sampleWall.thickness * HALF
  return {
    from: worldToScreen({ x: fromMm, y: reach }, VIEWPORT),
    to: worldToScreen({ x: toMm, y: reach }, VIEWPORT),
  }
}

/** Whether a recorded segment runs between `band`'s endpoints (either direction) within the screen tolerance. */
function nearBand(
  segment: { from: [number, number]; to: [number, number] },
  band: { from: Point; to: Point },
): boolean {
  const at = (a: readonly [number, number], point: Point): boolean =>
    Math.abs(a[0] - point.x) < SCREEN_TOLERANCE_PX && Math.abs(a[1] - point.y) < SCREEN_TOLERANCE_PX
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

describe('drawSurfacePaint construction-profile thickness', () => {
  // effectiveWallThickness is the resolver ADR-0160 moved the drawn wall faces onto
  // (issue #414); the painted band should key on that same assembly total rather
  // than the wall's raw thickness, so it lands on the drawn face instead of inside
  // the poche.
  it('offsets a painted wall face band by half the resolved assembly thickness for a wall with a construction profile', () => {
    const masonryWall: WallSceneNode = { ...sampleWall, constructionProfile: 'solid-masonry-brick' }
    const halfAssembly = effectiveWallThickness(masonryWall) * HALF

    const recorder = recordingContext()
    drawSurfacePaint(
      recorder.ctx,
      layer({ walls: [masonryWall], treatmentForFace: paintEveryFace }),
    )

    // The resolved assembly (231 mm) is a little over double the wall's raw
    // thickness (114 mm), so a band still keyed on raw thickness cannot land here.
    const band = faceBandAtOffset('left', halfAssembly)
    expect(
      recorder.segments.some((segment) => segment.style === SAGE_HEX && matchesBand(segment, band)),
    ).toBe(true)
  })
})

describe('drawSurfacePaint line weights', () => {
  // Pinned as bare numbers rather than ink-table expressions: these cases exist to
  // catch a width moving, and restating the derivation would make them tautologies.
  // Each case supplies only the layer whose width it reads, so that layer's stroke
  // is the last one the draw call sets.
  it('strokes a painted face band at three pixels', () => {
    const recorder = recordingContext()

    drawSurfacePaint(recorder.ctx, layer({ treatmentForFace: paintEveryFace }))

    expect(recorder.ctx.lineWidth).toBe(3)
  })

  it('strokes the active-surface accent centerline at two pixels', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({ activeSurface: { kind: 'wall-face', wallId: 'a', side: 'left' } }),
    )

    expect(recorder.ctx.lineWidth).toBe(2)
  })

  it('strokes the highlighted-face band at four pixels, over the paint band', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({ highlightedSurface: { kind: 'wall-face', wallId: 'a', side: 'left' } }),
    )

    expect(recorder.ctx.lineWidth).toBe(4)
  })
})

// A wall a doorway stands in has no face there to finish, so the painted bands
// stop at the jambs the poche and face lines already stop at (ADR-0160 decision
// 4). Until the opening's own gap fill retired, an unbroken band survived only
// because the opening painted over the part of it that crossed the doorway.
describe('drawSurfacePaint at openings', () => {
  const OPENING_FROM_MM = 300
  const OPENING_TO_MM = 700

  // A cased opening clearing the middle 400 mm of the sample wall, leaving a stub
  // of standing wall at each end. hostWallId is the RAW wall id: the scene node id
  // 'wall:a' with its 'wall:' prefix stripped.
  // prettier-ignore
  const doorway: OpeningSceneNode = {
    id: 'opening:a', kind: 'opening', floorId: 'g', type: 'cased-opening',
    center: { x: 500, y: 0 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    width: OPENING_TO_MM - OPENING_FROM_MM, height: 2032, sillHeight: 0, hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' }, hostWallId: 'a',
  }

  /** The sage bands `drawSurfacePaint` records for a wall painted on both faces with `doorway` in it. */
  function paintedBands(): { from: [number, number]; to: [number, number] }[] {
    const recorder = recordingContext()
    drawSurfacePaint(recorder.ctx, layer({ treatmentForFace: paintEveryFace, openings: [doorway] }))
    return recorder.segments.filter((segment) => segment.style === SAGE_HEX)
  }

  it('breaks a painted face band at each jamb, leaving one band per standing stretch', () => {
    const painted = paintedBands()

    // Two painted faces, each cut into a stub either side of the doorway.
    expect(painted).toHaveLength(4)
    for (const side of BOTH_SIDES) {
      const before = faceBandSpan(side, 0, OPENING_FROM_MM)
      const after = faceBandSpan(side, OPENING_TO_MM, WALL_LENGTH_MM)
      expect(painted.some((segment) => nearBand(segment, before))).toBe(true)
      expect(painted.some((segment) => nearBand(segment, after))).toBe(true)
    }
  })

  it('stops running a finish across the doorway once the opening paints over nothing', () => {
    const painted = paintedBands()

    for (const side of BOTH_SIDES) {
      expect(painted.some((segment) => nearBand(segment, faceBand(side)))).toBe(false)
    }
  })

  it('breaks the highlighted face band at the same jambs', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({
        highlightedSurface: { kind: 'wall-face', wallId: 'a', side: 'left' },
        openings: [doorway],
      }),
    )

    // The highlight marks a face, so it stops where the face does.
    const accents = recorder.segments.filter((segment) => segment.style === ACCENT_HEX)
    expect(accents).toHaveLength(2)
    expect(accents.some((segment) => nearBand(segment, faceBand('left')))).toBe(false)
  })

  it('keeps the active-surface accent running the full wall a doorway sits in', () => {
    const recorder = recordingContext()

    drawSurfacePaint(
      recorder.ctx,
      layer({
        activeSurface: { kind: 'wall-face', wallId: 'a', side: 'left' },
        openings: [doorway],
      }),
    )

    // The accent runs the centerline to say which wall is being painted, and a wall
    // with a door in it is still one wall. It is not ink on a face, so it is not cut.
    const centerline = {
      from: worldToScreen(sampleWall.start, VIEWPORT),
      to: worldToScreen(sampleWall.end, VIEWPORT),
    }
    const accents = recorder.segments.filter((segment) => segment.style === ACCENT_HEX)
    expect(accents.some((segment) => nearBand(segment, centerline))).toBe(true)
  })
})
