import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  ActiveFloorProvider,
  createActiveFloorStore,
  createSelectionStore,
  EditorSessionProvider,
  SelectionProvider,
} from '../../bridge'
import { createEmptyProject, createFloor, createWall, type Point } from '../../core'
import { createEditorSession } from '../../session/testing'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'
import { ShellProviders } from '../shell/shell-providers'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { drawPlan } from './draw-plan'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import { PlanView } from './plan-view'
import { useViewport, type ViewportValue } from './viewport-context'
import { worldToScreen } from './viewport'

const PARTIAL = 'Part of this wall was already there.'
const FULL = 'This wall was already there.'
const GROUND = 'ground'
const UPPER = 'upper'

function point(x: number, y = 0): Point {
  return { x, y }
}

function segment(from: number, to: number, y = 0) {
  return { start: point(from, y), end: point(to, y) }
}

function expectExposedGuides(): void {
  const wall = { ...sampleWall, ...segment(0, 4000) }
  const viewport = { scale: 0.1, offset: { x: 150, y: 200 } }
  const cases = [
    { stroke: segment(-1000, 5000), exposed: [segment(-1000, 0), segment(4000, 5000)] },
    { stroke: segment(1000, 3000), exposed: [] },
    { stroke: segment(-1000, 5000, 1000), exposed: [segment(-1000, 5000, 1000)] },
  ]
  const screenPoint = (at: Point): [number, number] => {
    const { x, y } = worldToScreen(at, viewport)
    return [x, y]
  }

  for (const { stroke, exposed } of cases) {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport,
      width: 800,
      height: 600,
      selectedIds: new Set(),
      preview: stroke,
    })
    const guides = recorder.segments.filter((line) => line.style === DEFAULT_PLAN_PALETTE.preview)
    expect
      .soft(guides.map(({ from, to }) => ({ from, to })))
      .toEqual(
        exposed.map(({ start, end }) => ({ from: screenPoint(start), to: screenPoint(end) })),
      )
    if (stroke.start.y !== wall.start.y) {
      const [x, y] = screenPoint(stroke.start)
      expect.soft(recorder.arcs).toEqual([expect.objectContaining({ x, y })])
    }
  }
}

function ReportViewport({ report }: { report: (viewport: ViewportValue) => void }) {
  report(useViewport())
  return null
}

function mountPlan() {
  const project = createEmptyProject({
    name: 'House',
    period: 'modern',
    units: 'metric',
    appVersion: '0.0.0',
  })
  project.floors = [
    createFloor('Ground', {
      id: GROUND,
      walls: [createWall(point(0), point(150), { id: 'host' })],
    }),
    createFloor('Upper', { id: UPPER }),
  ]
  const session = createEditorSession(project)
  const activeFloor = createActiveFloorStore(GROUND)
  let view: ViewportValue | undefined
  const { unmount } = render(
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={session}>
          <SelectionProvider store={createSelectionStore()}>
            <ActiveFloorProvider store={activeFloor}>
              <ActiveToolProvider initialTool="draw-wall">
                <EditLayerProvider>
                  <ShellProviders>
                    <ReportViewport report={(value) => (view = value)} />
                    <PlanView />
                  </ShellProviders>
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>,
  )
  const initialView = view
  if (initialView === undefined) throw new Error('expected a viewport for the plan')
  act(() => initialView.setViewport({ scale: 1, offset: { x: 200, y: 200 } }))
  const canvas = screen.getByLabelText('Floor plan')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
  Object.defineProperty(canvas, 'hasPointerCapture', { value: () => false })
  return {
    clickAt(x: number) {
      const at = worldToScreen(point(x), view?.viewport ?? initialView.viewport)
      const pointer = { bubbles: true, clientX: at.x, clientY: at.y, button: 0 }
      fireEvent(canvas, new MouseEvent('pointermove', pointer))
      fireEvent(canvas, new MouseEvent('pointerdown', { ...pointer, buttons: 1 }))
      fireEvent(canvas, new MouseEvent('pointerup', pointer))
    },
    lastWallEnd() {
      return session.getProject().floors[0]?.walls.at(-1)?.end
    },
    changeFloor() {
      act(() => activeFloor.setActiveFloorId(UPPER))
    },
    unmount,
  }
}

function press(key: string): void {
  fireEvent.keyDown(window, { key })
}

function announcementRegion(): HTMLElement {
  const status = screen
    .getAllByRole('status')
    .find((region) => region.getAttribute('aria-live') === 'polite')
  if (status === undefined) throw new Error('expected a polite announcement region for the plan')
  return status
}

function expectNote(note: string, input: string): void {
  const status = announcementRegion()
  expect.soft(status.textContent, input).toBe(note)
  const notices = screen
    .queryAllByText(note, { exact: true })
    .filter((node) => !status.contains(node))
  expect.soft(notices, input).toHaveLength(1)
  const [notice] = notices
  if (notice !== undefined) expect.soft(notice, input).toBeVisible()
}

function expectNoOverlapNotice(): void {
  expect.soft(screen.queryAllByText(PARTIAL, { exact: true })).toHaveLength(0)
  expect.soft(screen.queryAllByText(FULL, { exact: true })).toHaveLength(0)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('shows the exposed parts of a wall draw and reports the overlap for either input', () => {
  expectExposedGuides()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

  const pointer = mountPlan()
  pointer.clickAt(150)
  pointer.clickAt(0)
  expectNote(FULL, 'pointer')
  pointer.clickAt(450)
  expect.soft(pointer.lastWallEnd()?.x).toBeGreaterThan(150)
  expect.soft(pointer.lastWallEnd()?.y).toBeCloseTo(0, 6)
  expectNote(PARTIAL, 'pointer')
  pointer.changeFloor()
  expectNoOverlapNotice()
  pointer.unmount()

  const keyboard = mountPlan()
  press('Enter')
  press('ArrowRight')
  press('Enter')
  expectNote(FULL, 'keyboard')
  press('ArrowRight')
  press('ArrowRight')
  press('Enter')
  expect.soft(keyboard.lastWallEnd()?.x).toBeGreaterThan(150)
  expectNote(PARTIAL, 'keyboard')
  press('ArrowRight')
  press('Enter')
  expectNoOverlapNotice()
  expect.soft(announcementRegion()).toHaveTextContent('Wall vertex dropped')
})
