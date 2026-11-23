import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'
import { SceneChrome } from './scene-chrome'
import { SceneFailureHost } from './scene-failure-host'
import { FailureProbe } from './scene-failure-probe-test-support'
import { SceneFailureViewContext } from './scene-failure-view-context'
import { SCENE_RENDERER_FAILED_ATTRIBUTE } from './scene-readiness'
import type { RenderBackend } from '../../engine'

let mockBackend: RenderBackend = 'unsupported'
let mockLiveViewFailed = false

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
  LiveSceneView: () => (
    <div data-testid="live-scene-view">
      <SceneChrome>
        <span>chrome stand-in</span>
      </SceneChrome>
      {mockLiveViewFailed ? <SceneFailureHost kind="start" /> : null}
    </div>
  ),
}))

describe('SceneCanvas', () => {
  afterEach(() => {
    mockBackend = 'unsupported'
    mockLiveViewFailed = false
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
    expect(
      container.querySelector(`[${SCENE_RENDERER_FAILED_ATTRIBUTE}="start"]`)?.contains(probe),
    ).toBe(true)
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

  it('removes the scene chrome of the live view while a failure view is mounted in it', () => {
    mockBackend = 'webgpu'

    const working = render(<SceneCanvas />)
    expect(screen.getByText('chrome stand-in')).toBeInTheDocument()
    working.unmount()

    mockLiveViewFailed = true
    render(<SceneCanvas />)

    expect(screen.queryByText('chrome stand-in')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
