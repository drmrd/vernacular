import { Suspense, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'

import { sceneGraphForFloor, sceneGraphHasGeometry } from '../../core'
import { detectRenderBackend } from '../../engine'
import { SceneCanvas, useActiveFloorId, useSceneGraph } from '../../bridge'
import { EmptyState, LoadingState } from '../design-system'
import './scene-pane.css'

const LIVE_SCENE_CANVAS_SELECTOR = '[data-testid="live-scene-canvas"]'

// Whether the pane's own subtree reports its first frame ready: true when the live
// canvas node is not (yet) present, so a not-yet-mounted or still-suspended canvas
// never stacks a redundant loading placeholder on top of the Suspense fallback, and
// otherwise whatever the canvas's own data-harness-ready attribute says.
function readSceneReady(paneNode: HTMLElement): boolean {
  const canvasNode = paneNode.querySelector(LIVE_SCENE_CANVAS_SELECTOR)
  return canvasNode === null || canvasNode.getAttribute('data-harness-ready') === 'true'
}

// Watches the pane's own wrapper for the live canvas flipping its data-harness-ready
// attribute, so the loading placeholder clears the moment the canvas reports its first
// frame without requiring a React re-render from the bridge layer to drive it.
function useSceneReady(paneRef: RefObject<HTMLDivElement | null>): boolean {
  const [isSceneReady, setIsSceneReady] = useState(true)
  useEffect(() => {
    const paneNode = paneRef.current
    if (!paneNode) return
    setIsSceneReady(readSceneReady(paneNode))
    const observer = new MutationObserver(() => setIsSceneReady(readSceneReady(paneNode)))
    observer.observe(paneNode, {
      attributes: true,
      attributeFilter: ['data-harness-ready'],
      subtree: true,
    })
    return () => observer.disconnect()
  }, [paneRef])
  return isSceneReady
}

// The pane lives in the editor layer so the styled fallback can use the design
// system, which the bridge layer cannot import.
export function ScenePane(): ReactElement {
  const graph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const paneRef = useRef<HTMLDivElement | null>(null)
  const isSceneReady = useSceneReady(paneRef)
  if (detectRenderBackend() !== 'webgpu') {
    return (
      <EmptyState
        asRegion={false}
        title="3D preview unavailable"
        description="Your browser does not support WebGPU, which the 3D preview needs. Your plan and the 2D editor are unaffected."
      />
    )
  }
  const floorGraph = sceneGraphForFloor(graph, activeFloorId)
  const isActiveFloorEmpty = !sceneGraphHasGeometry(floorGraph)
  return (
    <div className="scene-pane" ref={paneRef}>
      <Suspense fallback={<LoadingState message="Preparing 3D view..." />}>
        <SceneCanvas />
      </Suspense>
      {isSceneReady ? null : (
        <div className="scene-pane__overlay">
          <LoadingState message="Building the scene..." />
        </div>
      )}
      {isSceneReady && isActiveFloorEmpty ? (
        <div className="scene-pane__overlay">
          <EmptyState
            asRegion={false}
            title="Nothing to show in 3D yet"
            description="Draw walls in plan view to see them here in 3D."
          />
        </div>
      ) : null}
    </div>
  )
}
