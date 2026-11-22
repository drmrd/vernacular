import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'
import { FailureProbe } from './scene-failure-probe-test-support'
import { SceneFailureViewContext } from './scene-failure-view-context'
import type { RenderBackend } from '../../engine'

let mockBackend: RenderBackend = 'unsupported'

// The probe is mocked at the module edge so each case states the runtime it means
// rather than reaching for navigator and a canvas context.
vi.mock('../../engine', () => ({
  detectRenderBackend: () => mockBackend,
}))

// The live view mounts an R3F <Canvas>, which measures its parent through a
// ResizeObserver jsdom does not define. The stub keeps this file about which branch
// SceneCanvas takes, not about the renderer.
vi.mock('./live-scene-view', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  LiveSceneView: () => <div data-testid="live-scene-view" />,
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
    expect(screen.queryByTestId('live-scene-view')).toBeNull()
  })

  it('shows the view that fills the failure slot when the runtime can render no 3D at all', () => {
    mockBackend = 'unsupported'

    const { container } = render(
      <SceneFailureViewContext.Provider value={FailureProbe}>
        <SceneCanvas />
      </SceneFailureViewContext.Provider>,
    )

    const probe = screen.getByRole('button', { name: 'filled view' })
    expect(probe).toHaveAttribute('data-kind', 'start')
    expect(container.querySelector('[data-scene-renderer-failed="start"]')?.contains(probe)).toBe(
      true,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('mounts the live scene view when the runtime falls back to WebGL 2', () => {
    // The renderer selects WebGPU when it is there and falls back to its own WebGL 2
    // backend when it is not, so a WebGL 2 runtime gets a working preview rather than
    // an unsupported message.
    mockBackend = 'webgl2'

    render(<SceneCanvas />)

    expect(screen.getByTestId('live-scene-view')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('mounts the live scene view when the runtime exposes WebGPU', () => {
    mockBackend = 'webgpu'

    render(<SceneCanvas />)

    expect(screen.getByTestId('live-scene-view')).toBeInTheDocument()
  })
})
