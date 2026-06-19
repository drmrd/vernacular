import { detectRenderBackend } from '../../engine'
import { SceneCanvas } from '../../bridge'
import { EmptyState } from '../design-system'

// The 3D preview pane. Renders the live WebGPU scene when WebGPU is available,
// otherwise a styled design-system empty state reassuring the user that their
// plan and the 2D editor are unaffected. The pane lives in the editor layer so
// the styled fallback can use the design system, which the bridge layer cannot
// import.
export function ScenePane() {
  if (detectRenderBackend() !== 'webgpu') {
    return (
      <EmptyState
        asRegion={false}
        title="3D preview unavailable"
        description="Your browser does not support WebGPU, which the 3D preview needs. Your plan and the 2D editor are unaffected."
      />
    )
  }
  return <SceneCanvas />
}
