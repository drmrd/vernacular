import type { ReactElement } from 'react'

import { detectRenderBackend } from '../../engine'
import { SceneCanvas } from '../../bridge'
import { EmptyState } from '../design-system'

// The pane lives in the editor layer so the styled fallback can use the design
// system, which the bridge layer cannot import.
export function ScenePane(): ReactElement {
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
