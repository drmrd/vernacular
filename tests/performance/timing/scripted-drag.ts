import type { Floor, Project } from '../../../core'
import type { DrawPlanOptions, PreviewSegment } from '../../../editor/plan/draw-plan'
import { referenceDrawOptions } from '../reference-plan-scene'

/** How far from the wall's real end the dragged end stays, in millimetres. */
const DRAG_CIRCLE_RADIUS_MM = 500

/** One turn around the circle, in radians. */
const FULL_CIRCLE_RADIANS = Math.PI * 2

/**
 * Draw options for each frame of a scripted drag of the first wall's end on a floor, built
 * before any timing starts, so none of this work is in a timed interval.
 *
 * The first wall of the floor is selected and carries the endpoint handles. The preview runs from
 * the wall's fixed start to an end that walks a circle of 500 mm around the wall's real end, one
 * step for each frame; the snap is off. The base options are built once and shared, so the
 * walls, the rooms, and every other field are the same objects in every frame, as during a
 * real drag. The frames set only `preview`, `selectedIds`, and `endpointHandles` because a real
 * endpoint drag changes only these: it shows no snap indicator through `drawPlan`, and it has no
 * hovered wall, since a pointer move with a button held clears the hover state
 * (`editor/plan/use-plan-hover.ts`). The list is deterministic.
 */
export function referenceDragFrames(
  project: Project,
  floor: Floor,
  frameCount: number,
): DrawPlanOptions[] {
  const base = referenceDrawOptions(project, floor)
  const dragged = base.walls[0]
  if (dragged === undefined) {
    throw new Error('A reference floor has no wall to drag')
  }
  const selectedIds: ReadonlySet<string> = new Set([dragged.id])
  return Array.from({ length: frameCount }, (_, index): DrawPlanOptions => {
    const angle = (FULL_CIRCLE_RADIANS * index) / frameCount
    const preview: PreviewSegment = {
      start: dragged.start,
      end: {
        x: dragged.end.x + DRAG_CIRCLE_RADIUS_MM * Math.cos(angle),
        y: dragged.end.y + DRAG_CIRCLE_RADIUS_MM * Math.sin(angle),
      },
    }
    return { ...base, selectedIds, preview, endpointHandles: dragged }
  })
}
