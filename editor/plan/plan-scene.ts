import { useEffect, type RefObject } from 'react'
import type { UnitPreferences, WallSceneNode } from '../../core'
import type { DragReadout } from './drag-readout'
import type { DrawableDimension } from './draw-dimension'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import type { DrawableOpening } from './draw-opening'
import type { DrawableUnderlay } from './draw-underlay'
import type { SnapResult } from './snap'
import type { Viewport } from './viewport'

export const PLAN_WIDTH = 800
export const PLAN_HEIGHT = 600

export type CanvasRef = RefObject<HTMLCanvasElement | null>

export interface PlanScene {
  walls: DrawPlanOptions['walls']
  // The scene graph always supplies rooms, so this is non-optional here even
  // though drawPlan accepts rooms as an optional overlay.
  rooms: NonNullable<DrawPlanOptions['rooms']>
  selectedIds: ReadonlySet<string>
  // The entity highlighted under the resting pointer in Select mode, or undefined
  // when nothing is hovered.
  hoveredId: string | undefined
  preview: PreviewSegment | undefined
  snap: SnapResult | null
  marquee: DrawPlanOptions['marquee']
  // The single selected wall under the select tool whose endpoint handles paint,
  // or null when no wall is editable.
  endpointHandles: WallSceneNode | null
  viewport: Viewport
  // The active unit preferences that format the room-label area text.
  preferences: UnitPreferences
  underlays: readonly DrawableUnderlay[]
  openings: readonly DrawableOpening[]
  dimensions: readonly DrawableDimension[]
  // Stairs drawn over the room fills and beneath the wall strokes.
  stairs: NonNullable<DrawPlanOptions['stairs']>
  // The live calibration measurement segment, or undefined when not measuring.
  calibration: PreviewSegment | undefined
  // The translated ghost of the selection during a move-drag, empty otherwise.
  ghost: readonly PreviewSegment[]
  // The displacement readout pill shown during a move-drag, or undefined otherwise.
  // A DOM overlay leaf, so it stays out of the canvas draw options and redraw.
  readout: DragReadout | undefined
  // The per-face treatment lookup and active surface the plan renders as paint
  // bands and a highlight beneath the wall strokes.
  surfacePaint: NonNullable<DrawPlanOptions['surfacePaint']>
  // The active floor's solid paint color, which tints the room fills, or undefined
  // when the floor is unpainted.
  roomFillColor: string | undefined
}

/**
 * Assembles the drawPlan options from the flattened scene leaves. Optional
 * overlays (preview, snap, marquee, endpoint handles, calibration) are spread in
 * only when present so an absent one stays off under exactOptionalPropertyTypes.
 */
function buildDrawOptions(scene: PlanScene): DrawPlanOptions {
  return {
    walls: scene.walls,
    rooms: scene.rooms,
    viewport: scene.viewport,
    width: PLAN_WIDTH,
    height: PLAN_HEIGHT,
    selectedIds: scene.selectedIds,
    grid: true,
    rulers: true,
    roomLabels: { preferences: scene.preferences },
    underlays: scene.underlays,
    openings: scene.openings,
    dimensions: scene.dimensions,
    stairs: scene.stairs,
    surfacePaint: scene.surfacePaint,
    ...(scene.roomFillColor !== undefined ? { roomFillColor: scene.roomFillColor } : {}),
    ...(scene.hoveredId !== undefined ? { hoveredId: scene.hoveredId } : {}),
    ...(scene.preview ? { preview: scene.preview } : {}),
    ...(scene.snap ? { snap: scene.snap } : {}),
    ...(scene.marquee ? { marquee: scene.marquee } : {}),
    ...(scene.endpointHandles ? { endpointHandles: scene.endpointHandles } : {}),
    ...(scene.calibration ? { calibration: scene.calibration } : {}),
    ...(scene.ghost.length > 0 ? { ghost: scene.ghost } : {}),
  }
}

/**
 * Redraws the canvas whenever any draw-meaningful scene leaf changes. The effect
 * depends on each leaf member individually rather than on the per-render scene
 * object, which would rasterize on every render; the scene members are listed
 * explicitly because exhaustive-deps cannot infer them through buildDrawOptions.
 */
export function usePlanRedraw(canvasRef: CanvasRef, scene: PlanScene): void {
  const options = buildDrawOptions(scene)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      drawPlan(ctx, options)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leaf deps, not `options`/`scene`
  }, [
    canvasRef,
    scene.walls,
    scene.rooms,
    scene.selectedIds,
    scene.hoveredId,
    scene.preview,
    scene.snap,
    scene.marquee,
    scene.endpointHandles,
    scene.viewport,
    scene.preferences,
    scene.underlays,
    scene.openings,
    scene.dimensions,
    scene.stairs,
    scene.calibration,
    scene.ghost,
    scene.surfacePaint,
    scene.roomFillColor,
  ])
}
