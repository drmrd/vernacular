import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveFloorProvider, EditorSessionProvider, createActiveFloorStore } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import { createEmptyProject, createFloor, createWall } from '../../core'
import { ViewportProvider, useViewport, type ViewportValue } from '../plan/viewport-context'
import {
  DEFAULT_PLAN_SCALE,
  screenToWorld,
  worldToScreen,
  type ViewportSize,
} from '../plan/viewport'
import { ZoomControl } from './zoom-control'

afterEach(cleanup)

const FLOOR_ID = 'ground'
const MEASURED: ViewportSize = { width: 1000, height: 400 }
const MEASURED_CENTER = { x: 500, y: 200 }
const NOMINAL_CENTER = { x: 400, y: 300 }
const ZOOM_STEP = 1.25
const PANNED = { scale: 0.2, offset: { x: 30, y: 40 } }
// An L of two walls: its corners are (0, 0) and (10000, 3000) millimeters.
const CORNERS = [
  { x: 0, y: 0 },
  { x: 10000, y: 3000 },
]
const CONTENT_CENTER = { x: 5000, y: 1500 }

function projectWithWalls() {
  const project = createEmptyProject({
    name: 'Sample plan',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 10000, y: 0 }),
    createWall({ x: 10000, y: 0 }, { x: 10000, y: 3000 }),
  ]
  project.floors = [createFloor('Ground', { id: FLOOR_ID, walls })]
  return project
}

/** Reports the live viewport context so a test can read and drive it beside the control. */
function Probe({ onValue }: { onValue: (value: ViewportValue) => void }) {
  onValue(useViewport())
  return null
}

function renderControl() {
  let latest: ViewportValue | null = null
  const session = createEditorSession(projectWithWalls())
  const activeFloor = createActiveFloorStore(FLOOR_ID)
  render(
    <EditorSessionProvider session={session}>
      <ActiveFloorProvider store={activeFloor}>
        <ViewportProvider>
          <Probe onValue={(value) => (latest = value)} />
          <ZoomControl />
        </ViewportProvider>
      </ActiveFloorProvider>
    </EditorSessionProvider>,
  )
  return () => {
    if (latest === null) {
      throw new Error('the probe has not rendered')
    }
    return latest
  }
}

describe('ZoomControl around the measured stage', () => {
  it('keeps the world point at the centre of the measured stage when zooming in and out', async () => {
    const user = userEvent.setup()
    const current = renderControl()
    act(() => current().reportStageSize(MEASURED))
    act(() => current().setViewport(PANNED))
    const pinned = screenToWorld(MEASURED_CENTER, current().viewport)

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    const zoomedIn = current().viewport
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    const zoomedOut = current().viewport

    expect(zoomedIn.scale).toBeCloseTo(PANNED.scale * ZOOM_STEP)
    expect(zoomedOut.scale).toBeCloseTo(PANNED.scale / ZOOM_STEP)
    for (const viewport of [zoomedIn, zoomedOut]) {
      const centerWorld = screenToWorld(MEASURED_CENTER, viewport)
      expect(centerWorld.x).toBeCloseTo(pinned.x)
      expect(centerWorld.y).toBeCloseTo(pinned.y)
    }
  })

  it('resets to 100% around the same centre point of the measured stage', async () => {
    const user = userEvent.setup()
    const current = renderControl()
    act(() => current().reportStageSize(MEASURED))
    act(() => current().setViewport(PANNED))
    const pinned = screenToWorld(MEASURED_CENTER, current().viewport)

    await user.click(screen.getByRole('button', { name: 'Reset zoom to 100%' }))

    const reset = current().viewport
    const centerWorld = screenToWorld(MEASURED_CENTER, reset)
    expect(reset.scale).toBeCloseTo(DEFAULT_PLAN_SCALE)
    expect(centerWorld.x).toBeCloseTo(pinned.x)
    expect(centerWorld.y).toBeCloseTo(pinned.y)
  })

  it('fits the content inside the measured stage, centred on it', async () => {
    const user = userEvent.setup()
    const current = renderControl()
    act(() => current().reportStageSize(MEASURED))

    await user.click(screen.getByRole('button', { name: 'Fit to content' }))

    const { viewport } = current()
    for (const corner of CORNERS) {
      const onScreen = worldToScreen(corner, viewport)
      expect(onScreen.x).toBeGreaterThanOrEqual(0)
      expect(onScreen.x).toBeLessThanOrEqual(MEASURED.width)
      expect(onScreen.y).toBeGreaterThanOrEqual(0)
      expect(onScreen.y).toBeLessThanOrEqual(MEASURED.height)
    }
    const middle = worldToScreen(CONTENT_CENTER, viewport)
    expect(middle.x).toBeCloseTo(MEASURED_CENTER.x)
    expect(middle.y).toBeCloseTo(MEASURED_CENTER.y)
  })

  it('uses the nominal stage before any measurement and still reads 100%', async () => {
    const user = userEvent.setup()
    const current = renderControl()
    const pinned = screenToWorld(NOMINAL_CENTER, current().viewport)

    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveTextContent('100%')
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))

    const centerWorld = screenToWorld(NOMINAL_CENTER, current().viewport)
    expect(centerWorld.x).toBeCloseTo(pinned.x)
    expect(centerWorld.y).toBeCloseTo(pinned.y)
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveTextContent('125%')
  })
})
