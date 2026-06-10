import { dimensionGeometry } from '../../geometry/dimension'
import type { Point } from '../../model/types'
import { openingFootprint } from '../../topology/openings'
import type { SceneGraph } from '../../scene/scene-graph'

/** Default margin around the plan content, in world millimeters. */
const MARGIN_MM_DEFAULT = 100

/** Axis-aligned world-space bounds in millimeters. */
export interface PlanBounds {
  min: Point
  max: Point
}

/** A world-millimeter (y-up) to SVG-user-unit (y-down) mapping with a margin. */
export interface SvgView {
  /** SVG viewport width in user units (content width + 2 * margin). */
  width: number
  /** SVG viewport height in user units. */
  height: number
  /** Map a world point (mm, y-up) to an SVG point (user units, y-down). */
  project(point: Point): Point
}

export interface SvgViewOptions {
  /** Margin around the content in world millimeters. Default 100. */
  marginMm?: number
}

/** Collect every world point the plan SVG draws, across all geometry sources. */
function pointsFromGraph(graph: SceneGraph): Point[] {
  const points: Point[] = []
  for (const wall of graph.walls) {
    points.push(wall.start, wall.end)
  }
  for (const room of graph.rooms) {
    points.push(...room.polygon)
  }
  for (const opening of graph.openings) {
    points.push(
      ...openingFootprint(
        opening.center,
        opening.along,
        opening.normal,
        opening.width,
        opening.hostThickness,
      ),
    )
  }
  for (const dimension of graph.dimensions) {
    const geometry = dimensionGeometry(dimension.start, dimension.end, dimension.offset)
    points.push(geometry.lineStart, geometry.lineEnd, dimension.start, dimension.end)
  }
  return points
}

/**
 * The content bounds of everything the plan SVG draws: wall endpoints, room
 * polygons, opening footprints, and dimension geometry. null for an empty plan.
 */
export function planContentBounds(graph: SceneGraph): PlanBounds | null {
  const points = pointsFromGraph(graph)
  const first = points[0]
  if (first === undefined) {
    return null
  }

  const min: Point = { x: first.x, y: first.y }
  const max: Point = { x: first.x, y: first.y }
  for (const point of points) {
    min.x = Math.min(min.x, point.x)
    min.y = Math.min(min.y, point.y)
    max.x = Math.max(max.x, point.x)
    max.y = Math.max(max.y, point.y)
  }
  return { min, max }
}

/** Build the view for the given content bounds. An empty plan yields a minimal margin-only view. */
export function createSvgView(bounds: PlanBounds | null, options?: SvgViewOptions): SvgView {
  const margin = options?.marginMm ?? MARGIN_MM_DEFAULT

  if (bounds === null) {
    return {
      width: 2 * margin,
      height: 2 * margin,
      project: (point) => ({ x: point.x + margin, y: point.y + margin }),
    }
  }

  const { min, max } = bounds
  return {
    width: max.x - min.x + 2 * margin,
    height: max.y - min.y + 2 * margin,
    project: (point) => ({ x: point.x - min.x + margin, y: max.y - point.y + margin }),
  }
}
