import { useMemo, type ReactNode } from 'react'
import { CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { sceneGraphForFloor } from '../../core'
import { useActiveFloorId, useSceneGraph } from '../../bridge'
import { IconButton } from '../design-system'
import { computeFitViewport, contentBounds } from '../plan/fit'
import { PLAN_HEIGHT, PLAN_WIDTH } from '../plan/plan-scene'
import { useViewport } from '../plan/viewport-context'
import { DEFAULT_PLAN_SCALE, zoomAtCursor, zoomPercent } from '../plan/viewport'

// Each button press scales by this factor; zooming out is its reciprocal.
const ZOOM_STEP = 1.25
// Button zooms have no cursor, so they pivot about the canvas center.
const CENTER = { x: PLAN_WIDTH / 2, y: PLAN_HEIGHT / 2 }
const PLAN_SIZE = { width: PLAN_WIDTH, height: PLAN_HEIGHT }

// One square icon button in the zoom group, sharing the design-system icon-button styling.
function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconButton aria-label={label} onClick={onClick}>
      {children}
    </IconButton>
  )
}

/**
 * The header zoom control: zoom out, a live percent readout (click to reset to 100%),
 * zoom in, and fit-to-content. It drives the shared viewport, so the canvas, this
 * readout, and the wheel/`f`-key gestures all move one camera. The percent is relative
 * to the default scale, so the initial view reads 100%.
 */
export function ZoomControl() {
  const { viewport, setViewport } = useViewport()
  const fullGraph = useSceneGraph()
  const floorId = useActiveFloorId()
  // Memoized so a pan (which re-renders this control through the viewport) does not
  // re-filter the whole scene graph; only a graph or floor change recomputes it.
  const graph = useMemo(() => sceneGraphForFloor(fullGraph, floorId), [fullGraph, floorId])

  const zoomBy = (factor: number) => setViewport((current) => zoomAtCursor(current, CENTER, factor))

  const resetZoom = () =>
    setViewport((current) => zoomAtCursor(current, CENTER, DEFAULT_PLAN_SCALE / current.scale))

  const fitToContent = () => {
    const points = [
      ...graph.walls.flatMap((wall) => [wall.start, wall.end]),
      ...graph.rooms.flatMap((room) => room.polygon),
    ]
    const bounds = contentBounds(points)
    if (bounds) {
      setViewport(computeFitViewport(bounds, PLAN_SIZE))
    }
  }

  return (
    <div className="editor-shell__zoom" role="group" aria-label="Zoom">
      <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <MagnifyingGlassMinus size={16} aria-hidden="true" />
      </ZoomButton>
      <IconButton labeled aria-label="Reset zoom to 100%" onClick={resetZoom}>
        {zoomPercent(viewport.scale)}%
      </IconButton>
      <ZoomButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
        <MagnifyingGlassPlus size={16} aria-hidden="true" />
      </ZoomButton>
      <ZoomButton label="Fit to content" onClick={fitToContent}>
        <CornersOut size={16} aria-hidden="true" />
      </ZoomButton>
    </div>
  )
}
