import { polygonCentroid } from '../../geometry/polygon'
import type { Project } from '../../model/types'
import type { UnitPreferences } from '../../units'
import { DEFAULT_METRIC_PREFERENCES, formatArea } from '../../units'
import { deriveSceneGraph } from '../../scene/scene-graph'
import type { RoomSceneNode, SceneGraph } from '../../scene/scene-graph'
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
      [renderRooms(graph, context), renderWalls(graph, context), renderRoomLabels(graph, context)],
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
