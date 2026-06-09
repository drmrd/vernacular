import type { SceneGraph } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { DrawableOpening } from './draw-opening'
import { toDrawableOpenings } from './drawable-openings'
import { singleSelectedOpening } from './selected-opening'
import { useOpeningTool } from './opening-tool-context'
import { useOpeningEditing, type OpeningEditing } from './use-opening-editing'
import { useOpeningPlacement, type OpeningPlacement } from './use-opening-placement'
import type { Viewport } from './viewport'

export interface OpeningLayerDeps {
  session: EditorSession
  graph: SceneGraph
  tool: ToolId
  viewport: Viewport
  selectedIds: ReadonlySet<string>
}

export interface OpeningLayer {
  drawables: readonly DrawableOpening[]
  editing: OpeningEditing
  placement: OpeningPlacement
}

/**
 * Bundles the opening concerns the plan controller threads in: the drawable
 * openings for the redraw, the footprint-drag editing (select tool), and the
 * type-driven placement (place-opening tool). Reads the active placement type
 * from the shared opening-tool context. Keeps the controller within the
 * function-length budget; coverage-excluded glue like the layer it parallels.
 */
export function useOpeningLayer({
  session,
  graph,
  tool,
  viewport,
  selectedIds,
}: OpeningLayerDeps): OpeningLayer {
  const { placementType } = useOpeningTool()
  const selectedOpening = singleSelectedOpening(tool, selectedIds, graph)
  const editing = useOpeningEditing({ session, selectedOpening, graph, viewport })
  const placement = useOpeningPlacement({ session, graph, tool, viewport, placementType })
  const drawables = toDrawableOpenings(graph.openings, selectedIds)
  return { drawables, editing, placement }
}
