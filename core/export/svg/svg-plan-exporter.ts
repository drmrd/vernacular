import type { Project } from '../../model/types'
import { deriveSceneGraph } from '../../scene/scene-graph'
import type { SceneGraph } from '../../scene/scene-graph'
import type { Exporter, ExportResult } from '../exporter'
import { svgDocument, svgGroup, svgLine } from './svg-document'
import { createSvgView, planContentBounds } from './svg-view'
import type { SvgView } from './svg-view'

/** Wall stroke color, mirroring the on-screen plan ink (redeclared in core). */
const WALL_INK = '#222222'

export interface SvgPlanExportOptions {
  /** Margin around the content in world millimeters. Default 100. */
  marginMm?: number
}

/** The pure SVG exporter for the two-dimensional plan. */
export class SvgPlanExporter implements Exporter<SvgPlanExportOptions> {
  readonly media = 'image/svg+xml'

  export(project: Project, options?: SvgPlanExportOptions): ExportResult {
    const graph = deriveSceneGraph(project)
    const bounds = planContentBounds(graph)
    const view = createSvgView(bounds, options)
    const body = svgGroup([renderWalls(graph, view)], {})
    return { media: 'image/svg+xml', extension: 'svg', content: svgDocument(view, body) }
  }
}

/** Render every wall as a projected `<line>`, wrapped in a walls layer group. */
function renderWalls(graph: SceneGraph, view: SvgView): string {
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
