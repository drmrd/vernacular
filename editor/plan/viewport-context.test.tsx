import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import { ViewportProvider, useViewport, type ViewportValue } from './viewport-context'

afterEach(cleanup)

function Probe() {
  const { viewport, setViewport } = useViewport()
  return (
    <div>
      <span data-testid="scale">{viewport.scale}</span>
      <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: 1 }))}>
        Zoom
      </button>
    </div>
  )
}

/** Reports the current viewport context value to the caller instead of rendering it. */
function ViewportProbe({ onValue }: { onValue: (value: ViewportValue) => void }) {
  onValue(useViewport())
  return null
}

describe('viewport-context', () => {
  it('defaults to the default plan scale', () => {
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    )

    expect(screen.getByTestId('scale')).toHaveTextContent(String(DEFAULT_PLAN_SCALE))
  })

  it('updates the shared viewport via setViewport', async () => {
    const user = userEvent.setup()
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Zoom' }))

    expect(screen.getByTestId('scale')).toHaveTextContent('1')
  })

  it('throws when used outside a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow()

    consoleError.mockRestore()
  })

  it('frames drawn content already in the positive quadrant on the initial viewport', () => {
    // A document whose geometry sits in the positive quadrant, the convention
    // the format spec's sample plan uses, opens off-screen under the fixed
    // default viewport.
    const walls = [
      { start: { x: 610, y: 610 }, end: { x: 7275, y: 610 } },
      { start: { x: 7275, y: 610 }, end: { x: 7275, y: 16786 } },
    ]
    const size = { width: 800, height: 600 }

    let captured: ViewportValue | undefined
    render(
      <ViewportProvider initialContent={{ walls, rooms: [], size }}>
        <ViewportProbe onValue={(value) => (captured = value)} />
      </ViewportProvider>,
    )

    const { viewport } = captured as ViewportValue
    const minCorner = worldToScreen({ x: 610, y: 610 }, viewport)
    const maxCorner = worldToScreen({ x: 7275, y: 16786 }, viewport)

    // Both corners of the drawn geometry land on screen when the document opens,
    // the fit the "f" key produces, instead of the origin-cornered default viewport
    // (which maps any positive-y content above the visible canvas, per ADR-0099's
    // y-up negation).
    expect(minCorner.x).toBeGreaterThanOrEqual(0)
    expect(minCorner.x).toBeLessThanOrEqual(size.width)
    expect(minCorner.y).toBeGreaterThanOrEqual(0)
    expect(minCorner.y).toBeLessThanOrEqual(size.height)
    expect(maxCorner.x).toBeGreaterThanOrEqual(0)
    expect(maxCorner.x).toBeLessThanOrEqual(size.width)
    expect(maxCorner.y).toBeGreaterThanOrEqual(0)
    expect(maxCorner.y).toBeLessThanOrEqual(size.height)
  })
})
