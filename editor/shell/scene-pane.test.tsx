import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScenePane } from './scene-pane'

// Mock the bridge SceneCanvas at the module edge ScenePane imports so the
// WebGPU-present branch renders a lightweight stub. This keeps the unit under
// test "which branch ScenePane selects," not the R3F/WebGPU renderer internals.
vi.mock('../../bridge', () => ({
  SceneCanvas: () => <div data-testid="live-scene-canvas" />,
}))

describe('ScenePane', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the styled empty-state fallback when WebGPU is unavailable', () => {
    vi.stubGlobal('navigator', {})

    const { container } = render(<ScenePane />)

    // The design-system EmptyState title, not a bare unstyled string.
    expect(screen.getByText(/3D preview unavailable/i)).toBeInTheDocument()
    // Rendered through the EmptyState primitive (its section markup), not a raw div.
    expect(container.querySelector('.ds-status--empty')).not.toBeNull()
  })

  it('reassures the user without nesting a duplicate region landmark', () => {
    vi.stubGlobal('navigator', {})

    const { container } = render(<ScenePane />)

    // The reassurance copy that the plan and 2D editor are unaffected.
    expect(screen.getByText(/2D editor are unaffected/i)).toBeInTheDocument()
    // The shell pane already owns the labeled region, so the EmptyState must be
    // rendered with asRegion={false}: no nested region landmark inside the fallback.
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('.ds-status--empty')?.getAttribute('role')).toBeNull()
  })

  it('renders the live scene rather than the fallback when WebGPU is available', () => {
    vi.stubGlobal('navigator', { gpu: {} })

    render(<ScenePane />)

    // The non-fallback branch is taken: the fallback copy is absent and the
    // delegated scene canvas renders instead.
    expect(screen.queryByText(/3D preview unavailable/i)).toBeNull()
    expect(screen.getByTestId('live-scene-canvas')).toBeInTheDocument()
  })
})
