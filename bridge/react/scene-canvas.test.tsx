import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'
import type { LivePreviewBackend } from './live-preview-backend'

let mockBackend: LivePreviewBackend = 'unsupported'

// The probe is mocked at the module edge so each case states the runtime it means
// rather than reaching for navigator and a canvas context.
vi.mock('./live-preview-backend', () => ({
  detectLivePreviewBackend: () => mockBackend,
}))

// The live view mounts an R3F <Canvas>, which measures its parent through a
// ResizeObserver jsdom does not define. The stub keeps this file about which branch
// SceneCanvas takes, not about the renderer.
vi.mock('./webgpu-scene-view', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  WebGPUSceneView: () => <div data-testid="webgpu-scene-view" />,
}))

describe('SceneCanvas', () => {
  afterEach(() => {
    mockBackend = 'unsupported'
  })

  it('renders an accessible fallback when the runtime can render no 3D at all', () => {
    mockBackend = 'unsupported'

    render(<SceneCanvas />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/3D view/i)
    expect(screen.queryByTestId('webgpu-scene-view')).toBeNull()
  })

  it('mounts the live scene view when the runtime falls back to WebGL 2', () => {
    // The renderer selects WebGPU when it is there and falls back to its own WebGL 2
    // backend when it is not, so a WebGL 2 runtime gets a working preview rather than
    // an unsupported message.
    mockBackend = 'webgl2'

    render(<SceneCanvas />)

    expect(screen.getByTestId('webgpu-scene-view')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('mounts the live scene view when the runtime exposes WebGPU', () => {
    mockBackend = 'webgpu'

    render(<SceneCanvas />)

    expect(screen.getByTestId('webgpu-scene-view')).toBeInTheDocument()
  })
})
