import {
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react'

import { sceneGraphForFloor, sceneGraphHasGeometry } from '../../core'
import { SceneCanvas, detectRenderBackend, useActiveFloorId, useSceneGraph } from '../../bridge'
import {
  LIVE_SCENE_CANVAS_TEST_ID,
  SCENE_READY_ATTRIBUTE,
  SCENE_RENDERER_FAILED_ATTRIBUTE,
} from '../../bridge/react/scene-readiness'
import { SceneFailureViewContext } from '../../bridge/react/scene-failure-view-context'
import { Banner, EmptyState, LoadingState, type Notification } from '../design-system'
import { ScenePaneFailureView } from './scene-pane-failure-view'
import './scene-pane.css'

const LIVE_SCENE_CANVAS_SELECTOR = `[data-testid="${LIVE_SCENE_CANVAS_TEST_ID}"]`
const SCENE_RENDERER_FAILED_SELECTOR = `[${SCENE_RENDERER_FAILED_ATTRIBUTE}]`

type SceneState = 'building' | 'ready' | 'failed'

// The renderer falls back to its own WebGL 2 backend when a browser exposes no WebGPU
// adapter, and the two backends can shade the same frame differently. Saying so keeps
// that difference from reading as a defect. It is the design system's banner rather
// than a bespoke strip so it carries the shell's notice styling and dismiss control.
const WEBGL_FALLBACK_NOTICE: Notification = {
  id: 'scene-pane-webgl-fallback',
  tier: 'banner',
  severity: 'info',
  message:
    'The 3D preview is running without WebGPU. Shading and lighting can look slightly different here.',
  dismissible: true,
}

// What the pane's own subtree reports: 'failed' when a failure view (marked with the
// renderer-failed attribute) is inside it, so the loading and empty-floor overlays do not
// cover the failure's text. Otherwise 'ready' when the live canvas node is not (yet)
// present, so a not-yet-mounted or still-suspended canvas never stacks a redundant loading
// placeholder on top of the Suspense fallback, and else whatever the canvas's own
// data-harness-ready attribute says.
function readSceneState(paneNode: HTMLElement): SceneState {
  if (paneNode.querySelector(SCENE_RENDERER_FAILED_SELECTOR) !== null) return 'failed'
  const canvasNode = paneNode.querySelector(LIVE_SCENE_CANVAS_SELECTOR)
  const isReady = canvasNode === null || canvasNode.getAttribute(SCENE_READY_ATTRIBUTE) === 'true'
  return isReady ? 'ready' : 'building'
}

// Watches the pane's own wrapper for the live canvas flipping its data-harness-ready
// attribute, or for the canvas node itself being inserted (the Suspense-resolve path),
// so the loading placeholder clears the moment the canvas reports its first frame
// without requiring a React re-render from the bridge layer to drive it.
//
// Reads with a layout effect, not a plain effect, so the corrected readiness is in
// place before the browser paints; a plain effect runs after paint and would flash
// one unready frame on the synchronous-mount path.
function useSceneState(paneRef: RefObject<HTMLDivElement | null>): SceneState {
  const [sceneState, setSceneState] = useState<SceneState>('ready')
  useLayoutEffect(() => {
    const paneNode = paneRef.current
    if (!paneNode) return
    setSceneState(readSceneState(paneNode))
    // Observing subtree childList also catches this pane's own overlay divs being
    // inserted or removed, which retriggers the callback below. That is harmless:
    // readSceneState is idempotent, so the extra firings just recompute the same
    // answer.
    const observer = new MutationObserver(() => setSceneState(readSceneState(paneNode)))
    observer.observe(paneNode, {
      attributes: true,
      attributeFilter: [SCENE_READY_ATTRIBUTE],
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [paneRef])
  return sceneState
}

// The notice shown while the preview renders through the renderer's WebGL 2 fallback.
// Dismissal is remembered for as long as the pane stays mounted and no longer: the
// message is worth one showing per visit, not a permanent stripe across the view.
function BackendNotice(): ReactElement | null {
  const [isDismissed, setDismissed] = useState(false)
  if (isDismissed) {
    return null
  }
  return (
    <div className="scene-pane__notice">
      <Banner notification={WEBGL_FALLBACK_NOTICE} onDismiss={() => setDismissed(true)} />
    </div>
  )
}

function StyledSceneCanvas(): ReactElement {
  return (
    <SceneFailureViewContext.Provider value={ScenePaneFailureView}>
      <SceneCanvas />
    </SceneFailureViewContext.Provider>
  )
}

// The pane lives in the editor layer so the styled fallback can use the design
// system, which the bridge layer cannot import.
export function ScenePane(): ReactElement {
  const graph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const paneRef = useRef<HTMLDivElement | null>(null)
  const sceneState = useSceneState(paneRef)
  const backend = detectRenderBackend()
  if (backend === 'unsupported') {
    return (
      <EmptyState
        asRegion={false}
        title="3D preview unavailable"
        description="Your browser cannot drive a 3D graphics context, which the preview needs. Your plan and the 2D editor are unaffected."
      />
    )
  }
  const floorGraph = sceneGraphForFloor(graph, activeFloorId)
  const isActiveFloorEmpty = !sceneGraphHasGeometry(floorGraph)
  return (
    <div className="scene-pane" ref={paneRef}>
      <Suspense fallback={<LoadingState message="Preparing 3D view..." />}>
        <StyledSceneCanvas />
      </Suspense>
      {backend === 'webgl2' ? <BackendNotice /> : null}
      {sceneState === 'building' ? (
        <div className="scene-pane__overlay">
          <LoadingState message="Building the scene..." />
        </div>
      ) : null}
      {sceneState === 'ready' && isActiveFloorEmpty ? (
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
