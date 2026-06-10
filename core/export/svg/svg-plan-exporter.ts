import { polygonCentroid } from '../../geometry/polygon'
import type { Point, Project } from '../../model/types'
import type { UnitPreferences } from '../../units'
import { DEFAULT_METRIC_PREFERENCES, formatArea } from '../../units'
import { deriveSceneGraph } from '../../scene/scene-graph'
import type { OpeningSceneNode, RoomSceneNode, SceneGraph } from '../../scene/scene-graph'
import { openingFootprint } from '../../topology/openings'
import type { Exporter, ExportResult } from '../exporter'
import { svgDocument, svgGroup, svgLine, svgPolygon, svgText } from './svg-document'
import { createSvgView, planContentBounds } from './svg-view'
import type { SvgView } from './svg-view'

/** Wall stroke color, mirroring the on-screen plan ink (redeclared in core). */
const WALL_INK = '#222222'
/** Room fill color, mirroring the on-screen room fill (redeclared in core). */
const ROOM_FILL = '#eef2f6'
/** Room label ink, mirroring the on-screen label color (redeclared in core). */
const LABEL_INK = '#37414d'
/** Opening gap fill, painted over the wall stroke so the wall reads as broken. */
const OPENING_GAP = '#ffffff'
/** Opening jamb cap stroke, mirroring the wall ink. */
const OPENING_INK = '#222222'
/** Room label font size in world millimeters. */
const LABEL_FONT_SIZE = 280
/** Vertical advance between the name and area label lines, in world millimeters. */
const LABEL_LINE_HEIGHT = 320

export interface SvgPlanExportOptions {
  /** Margin around the content in world millimeters. Default 100. */
  marginMm?: number
  /** Unit preferences for area and length text. Default DEFAULT_METRIC_PREFERENCES. */
  preferences?: UnitPreferences
}

/** Collaborators every render function needs, bundled to keep parameter lists small. */
interface SvgPlanContext {
  view: SvgView
  preferences: UnitPreferences
}

/** The pure SVG exporter for the two-dimensional plan. */
export class SvgPlanExporter implements Exporter<SvgPlanExportOptions> {
  readonly media = 'image/svg+xml'

  export(project: Project, options?: SvgPlanExportOptions): ExportResult {
    const graph = deriveSceneGraph(project)
    const bounds = planContentBounds(graph)
    const view = createSvgView(bounds, options)
    const preferences = options?.preferences ?? DEFAULT_METRIC_PREFERENCES
    const context: SvgPlanContext = { view, preferences }
    const body = svgGroup(
      [
        renderRooms(graph, context),
        renderWalls(graph, context),
        // Openings paint over the wall stroke so the wall reads as broken.
        renderOpenings(graph, context),
        renderRoomLabels(graph, context),
      ],
      {},
    )
    return { media: 'image/svg+xml', extension: 'svg', content: svgDocument(view, body) }
  }
}

/** Render every wall as a projected `<line>`, wrapped in a walls layer group. */
function renderWalls(graph: SceneGraph, { view }: SvgPlanContext): string {
  /* eslint-disable @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  const lines = graph.walls.map((wall) => {
    const start = view.project(wall.start)
    const end = view.project(wall.end)
    return svgLine({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      attributes: {
        stroke: WALL_INK,
        'stroke-width': wall.thickness,
        'stroke-linecap': 'round',
        // wall.id already carries the `wall:` scene-node prefix (see scene-graph).
        'data-node-id': wall.id,
      },
    })
  })
  return svgGroup(lines, { 'data-layer': 'walls' })
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Render every opening as a gap polygon plus jamb caps, wrapped in an openings layer group. */
function renderOpenings(graph: SceneGraph, context: SvgPlanContext): string {
  const groups = graph.openings.map((opening) => renderOpening(opening, context))
  /* eslint-disable @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  return svgGroup(groups, { 'data-layer': 'openings' })
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Render one opening as its gap polygon and two jamb caps.
 *
 * The coarse per-family glyph (swing leaf, window frame lines) is deferred per
 * Decision 4: registry-driven symbol classification is an editor/bridge concern,
 * and no committed test drives a glyph this slice.
 */
function renderOpening(opening: OpeningSceneNode, context: SvgPlanContext): string {
  const fragments = [openingGap(opening, context), ...openingJambs(opening, context)]
  // opening.id already carries the `opening:` scene-node prefix (see scene-graph).
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  return svgGroup(fragments, { 'data-node-id': opening.id })
}

/** Emit the opening's gap `<polygon>`, projected, filled with the gap color. */
function openingGap(opening: OpeningSceneNode, { view }: SvgPlanContext): string {
  const corners = openingFootprint(
    opening.center,
    opening.along,
    opening.normal,
    opening.width,
    opening.hostThickness,
  )
  const projected = corners.map((corner) => view.project(corner))
  return svgPolygon(projected, { fill: OPENING_GAP, stroke: 'none' })
}

/** Emit an across-wall `<line>` jamb cap at each of the opening's two jambs. */
function openingJambs(opening: OpeningSceneNode, context: SvgPlanContext): string[] {
  const halfWidth = opening.width / 2
  const jambStart = translate(opening.center, opening.along, -halfWidth)
  const jambEnd = translate(opening.center, opening.along, halfWidth)
  return [jambCap(jambStart, opening, context), jambCap(jambEnd, opening, context)]
}

/** Emit one across-wall jamb cap centered on `jamb`, spanning the host thickness. */
function jambCap(jamb: Point, opening: OpeningSceneNode, { view }: SvgPlanContext): string {
  const halfThickness = opening.hostThickness / 2
  const near = view.project(translate(jamb, opening.normal, -halfThickness))
  const far = view.project(translate(jamb, opening.normal, halfThickness))
  return svgLine({
    x1: near.x,
    y1: near.y,
    x2: far.x,
    y2: far.y,
    attributes: { stroke: OPENING_INK },
  })
}

/** Translate `origin` along unit `direction` by `distance` (world millimeters). */
function translate(origin: Point, direction: Point, distance: number): Point {
  return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
}

/** Render every room as a projected fill `<polygon>`, wrapped in a rooms layer group. */
function renderRooms(graph: SceneGraph, context: SvgPlanContext): string {
  /* eslint-disable @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  const polygons = graph.rooms.map((room) => {
    const projected = room.polygon.map((point) => context.view.project(point))
    // room.id already carries the `room:` scene-node prefix (see scene-graph).
    return svgPolygon(projected, { fill: ROOM_FILL, 'data-node-id': room.id })
  })
  return svgGroup(polygons, { 'data-layer': 'rooms' })
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Render every room's name and area labels, wrapped in a labels layer group painted last. */
function renderRoomLabels(graph: SceneGraph, context: SvgPlanContext): string {
  const labels = graph.rooms.flatMap((room) => renderRoomLabel(room, context))
  /* eslint-disable @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  return svgGroup(labels, { 'data-layer': 'room-labels' })
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Render one room's label: its name above its area, or just the area when unnamed. */
function renderRoomLabel(room: RoomSceneNode, context: SvgPlanContext): string[] {
  const anchor = context.view.project(polygonCentroid(room.polygon))
  const areaText = formatArea(room.area, context.preferences)
  if (room.name === undefined) {
    return [labelText(areaText, anchor)]
  }
  const areaAnchor = { x: anchor.x, y: anchor.y + LABEL_LINE_HEIGHT }
  return [labelText(room.name, anchor), labelText(areaText, areaAnchor)]
}

/** Emit a centered `<text>` line styled like the on-screen room label. */
function labelText(text: string, position: { x: number; y: number }): string {
  /* eslint-disable @typescript-eslint/naming-convention -- SVG attribute names are kebab-case per the SVG specification. */
  return svgText(text, position, {
    fill: LABEL_INK,
    'font-size': LABEL_FONT_SIZE,
    'text-anchor': 'middle',
  })
  /* eslint-enable @typescript-eslint/naming-convention */
}
