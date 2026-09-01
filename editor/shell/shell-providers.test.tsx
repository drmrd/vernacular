import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ShellProviders } from './shell-providers'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { addWall, createEmptyProject, createFloor, type Project } from '../../core'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'
import { PLAN_HEIGHT, PLAN_WIDTH } from '../plan/plan-scene'
import { useViewport, type ViewportValue } from '../plan/viewport-context'
import { worldToScreen } from '../plan/viewport'

afterEach(cleanup)

const FLOOR_ID = 'ground'

// A document whose geometry sits in the positive quadrant, the convention the
// format spec's sample plan uses, opens off-screen under the fixed default
// viewport (ADR-0099's y-up negation maps positive-y content above the canvas).
const FAR_CORNER = { x: 7275, y: 16786 }

function projectWithDrawnWalls(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: FLOOR_ID })]
  return project
}

/** Reports the current viewport context value to the caller instead of rendering it. */
function ViewportProbe({ onValue }: { onValue: (value: ViewportValue) => void }) {
  onValue(useViewport())
  return null
}

function renderShellProvidersWithDrawnWalls(onValue: (value: ViewportValue) => void) {
  const session = createEditorSession(projectWithDrawnWalls())
  session.dispatch(addWall(FLOOR_ID, { x: 610, y: 610 }, { x: 7275, y: 610 }))
  session.dispatch(addWall(FLOOR_ID, { x: 7275, y: 610 }, FAR_CORNER))
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore(FLOOR_ID)

  render(
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={session}>
          <SelectionProvider store={selection}>
            <ActiveFloorProvider store={activeFloor}>
              <ActiveToolProvider>
                <EditLayerProvider>
                  <ShellProviders>
                    <ViewportProbe onValue={onValue} />
                  </ShellProviders>
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>,
  )
}

describe('ShellProviders', () => {
  it('opens the plan viewport framing a document that already has drawn geometry', () => {
    let captured: ViewportValue | undefined
    renderShellProvidersWithDrawnWalls((value) => (captured = value))

    const { viewport } = captured as ViewportValue
    const minCorner = worldToScreen({ x: 610, y: 610 }, viewport)
    const maxCorner = worldToScreen(FAR_CORNER, viewport)

    // Both corners of the drawn geometry land on the plan canvas when the
    // document opens, instead of the origin-cornered default viewport this
    // seam still opens on today.
    expect(minCorner.x).toBeGreaterThanOrEqual(0)
    expect(minCorner.x).toBeLessThanOrEqual(PLAN_WIDTH)
    expect(minCorner.y).toBeGreaterThanOrEqual(0)
    expect(minCorner.y).toBeLessThanOrEqual(PLAN_HEIGHT)
    expect(maxCorner.x).toBeGreaterThanOrEqual(0)
    expect(maxCorner.x).toBeLessThanOrEqual(PLAN_WIDTH)
    expect(maxCorner.y).toBeGreaterThanOrEqual(0)
    expect(maxCorner.y).toBeLessThanOrEqual(PLAN_HEIGHT)
  })
})
