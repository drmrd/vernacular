import { Suspense, type ReactElement } from 'react'

import { sceneGraphForFloor, sceneGraphHasGeometry } from '../../core'
import { detectRenderBackend } from '../../engine'
import { SceneCanvas, useActiveFloorId, useSceneGraph } from '../../bridge'
import { EmptyState, LoadingState } from '../design-system'

// The pane lives in the editor layer so the styled fallback can use the design
// system, which the bridge layer cannot import.
export function ScenePane(): ReactElement {
  const graph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
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
  if (!sceneGraphHasGeometry(floorGraph)) {
    return (
      <EmptyState
        asRegion={false}
        title="Nothing to show in 3D yet"
        description="Draw walls in plan view to see them here in 3D."
      />
    )
  }
  return (
    <Suspense fallback={<LoadingState message="Preparing 3D view..." />}>
      <SceneCanvas />
    </Suspense>
  )
}
