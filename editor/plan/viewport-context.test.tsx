import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PLAN_SCALE, screenToWorld, worldToScreen, type ViewportSize } from './viewport'
import {
  ViewportProvider,
  useViewport,
  type ViewportInitialContent,
  type ViewportValue,
} from './viewport-context'

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

const OPENING_WALLS = [
  { start: { x: 610, y: 610 }, end: { x: 7275, y: 610 } },
  { start: { x: 7275, y: 610 }, end: { x: 7275, y: 16786 } },
]
const NOMINAL_SIZE: ViewportSize = { width: 800, height: 600 }
const OPENED_WITH_CONTENT: ViewportInitialContent = {
  walls: OPENING_WALLS,
  rooms: [],
  size: NOMINAL_SIZE,
}

/** Mounts a provider with one probe and returns a getter for the latest context value. */
function mountProvider(initialContent?: ViewportInitialContent): () => ViewportValue {
  let latest: ViewportValue | undefined
  render(
    <ViewportProvider initialContent={initialContent}>
      <ViewportProbe onValue={(value) => (latest = value)} />
    </ViewportProvider>,
  )
  return () => latest as ViewportValue
}

function expectOpeningCornersInside(value: ViewportValue, size: ViewportSize) {
  for (const corner of [
    { x: 610, y: 610 },
    { x: 7275, y: 16786 },
  ]) {
    const screen = worldToScreen(corner, value.viewport)
    expect(screen.x).toBeGreaterThanOrEqual(0)
    expect(screen.x).toBeLessThanOrEqual(size.width)
    expect(screen.y).toBeGreaterThanOrEqual(0)
    expect(screen.y).toBeLessThanOrEqual(size.height)
  }
}

describe('viewport-context stage size', () => {
  it('holds the nominal size as the stage size before any measurement', () => {
    const withoutContent = mountProvider()
    expect(withoutContent().stageSize).toEqual({ width: 800, height: 600 })
    cleanup()

    const withContent = mountProvider({ walls: [], rooms: [], size: { width: 1000, height: 700 } })
    expect(withContent().stageSize).toEqual({ width: 1000, height: 700 })
  })

  it('shows a reported stage size to every consumer', () => {
    const seen: ViewportValue[] = []
    render(
      <ViewportProvider>
        <ViewportProbe onValue={(value) => (seen[0] = value)} />
        <ViewportProbe onValue={(value) => (seen[1] = value)} />
      </ViewportProvider>,
    )

    act(() => probeValue(seen, 0).reportStageSize({ width: 1280, height: 505 }))

    expect(probeValue(seen, 0).stageSize).toEqual({ width: 1280, height: 505 })
    expect(probeValue(seen, 1).stageSize).toEqual({ width: 1280, height: 505 })
  })

  it('leaves the viewport the same object when a size is reported after the user changed it', () => {
    const current = mountProvider()
    act(() => current().setViewport({ scale: 0.5, offset: { x: 40, y: 30 } }))
    const moved = current().viewport

    act(() => current().reportStageSize({ width: 1280, height: 505 }))

    expect(current().stageSize).toEqual({ width: 1280, height: 505 })
    expect(current().viewport).toBe(moved)
  })

  it('refits the opening content to the first reported size when the viewport is untouched', () => {
    const current = mountProvider(OPENED_WITH_CONTENT)
    const measured = { width: 1000, height: 400 }

    act(() => current().reportStageSize(measured))

    expectOpeningCornersInside(current(), measured)
  })

  it('keeps the viewport the same object and the stage top-left point on a second report', () => {
    const current = mountProvider(OPENED_WITH_CONTENT)
    act(() => current().reportStageSize({ width: 1000, height: 400 }))
    const afterFirst = current().viewport
    const topLeft = screenToWorld({ x: 0, y: 0 }, afterFirst)

    act(() => current().reportStageSize({ width: 700, height: 500 }))

    expect(current().stageSize).toEqual({ width: 700, height: 500 })
    expect(current().viewport).toBe(afterFirst)
    expect(screenToWorld({ x: 0, y: 0 }, current().viewport)).toEqual(topLeft)
  })

  it('does not refit on the first report when the user already moved the viewport', () => {
    const current = mountProvider(OPENED_WITH_CONTENT)
    act(() => current().setViewport((previous) => ({ ...previous, offset: { x: 5, y: 9 } })))
    const moved = current().viewport

    act(() => current().reportStageSize({ width: 1000, height: 400 }))

    expect(current().viewport).toBe(moved)
  })

  it('ignores a zero-size report for both the stage size and the viewport', () => {
    const current = mountProvider(OPENED_WITH_CONTENT)
    const stageBefore = current().stageSize
    const viewportBefore = current().viewport

    act(() => current().reportStageSize({ width: 0, height: 0 }))

    expect(current().stageSize).toBe(stageBefore)
    expect(current().viewport).toBe(viewportBefore)
  })

  it('leaves the default viewport on the first report when the document opened empty', () => {
    const current = mountProvider()
    const viewportBefore = current().viewport

    act(() => current().reportStageSize({ width: 1280, height: 505 }))

    expect(current().viewport).toBe(viewportBefore)
    expect(current().viewport).toEqual({ scale: DEFAULT_PLAN_SCALE })
  })
})

function probeValue(seen: readonly ViewportValue[], index: number): ViewportValue {
  const value = seen[index]
  if (value === undefined) throw new Error(`viewport probe ${index} did not render`)
  return value
}
