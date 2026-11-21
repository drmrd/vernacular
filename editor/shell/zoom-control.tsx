import { useMemo } from 'react'
import { CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { sceneGraphForFloor, type SceneGraph } from '../../core'
import { useActiveFloorId, useSceneGraph } from '../../bridge'
import { IconButton } from '../design-system'
import { computeFitViewport, contentBounds } from '../plan/fit'
import { useViewport } from '../plan/viewport-context'
import { DEFAULT_PLAN_SCALE, zoomAtCursor, zoomPercent, type ViewportSize } from '../plan/viewport'
// Button zooms pivot about the stage center.
const stageCenter = (size: ViewportSize) => ({
  x: size.width / 2,
  y: size.height / 2,
})

// Wall ends and room corners that a fit must frame.
const graphPoints = (graph: SceneGraph) => [
  ...graph.walls.flatMap((wall) => [wall.start, wall.end]),
  ...graph.rooms.flatMap((room) => room.polygon),
]

// Each button press scales by this factor; zooming out is its reciprocal.
const ZOOM_STEP = 1.25

/**
 * The header zoom control: zoom out, a live percent readout (click to reset to 100%),
 * zoom in, and fit-to-content. It drives the shared viewport, so the canvas, this
 * readout, and the wheel/`f`-key gestures all move one camera. The percent is relative
 * to the default scale, so the initial view reads 100%. Button zooms have no cursor, so
 * they pivot about the measured stage center.
 */
export function ZoomControl() {
  const { viewport, setViewport, stageSize } = useViewport()
  const fullGraph = useSceneGraph()
  const floorId = useActiveFloorId()
  // Memoized so a pan (which re-renders this control through the viewport) does not
  // re-filter the whole scene graph; only a graph or floor change recomputes it.
  const graph = useMemo(() => sceneGraphForFloor(fullGraph, floorId), [fullGraph, floorId])

  const zoomBy = (factor: number) =>
    setViewport((current) => zoomAtCursor(current, stageCenter(stageSize), factor))
  const resetZoom = () =>
    setViewport((current) =>
      zoomAtCursor(current, stageCenter(stageSize), DEFAULT_PLAN_SCALE / current.scale),
    )

  const fitToContent = () => {
    const bounds = contentBounds(graphPoints(graph))
    if (bounds) {
      setViewport(computeFitViewport(bounds, stageSize))
    }
  }

  return (
    <div className="editor-shell__zoom" role="group" aria-label="Zoom">
      <IconButton aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <MagnifyingGlassMinus size={16} aria-hidden="true" />
      </IconButton>
      <IconButton
        labeled
        className="ds-icon-button--readout"
        aria-label="Reset zoom to 100%"
        onClick={resetZoom}
      >
        {zoomPercent(viewport.scale)}%
      </IconButton>
      <IconButton aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
        <MagnifyingGlassPlus size={16} aria-hidden="true" />
      </IconButton>
      <IconButton aria-label="Fit to content" onClick={fitToContent}>
        <CornersOut size={16} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
