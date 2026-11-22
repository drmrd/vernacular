import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolRail } from './tool-rail'
import { EditLayerPanel } from '../tools/edit-layer-panel'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  EnvironmentSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEnvironmentSessionStore,
  createSelectionStore,
} from '../../bridge'
import { createEditorSession } from '../../session/testing'
import { createEmptyProject, createFloor, type Project } from '../../core'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function renderRail() {
  const session = createEditorSession(projectWithFloor())
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore(session.getProject().floors[0]?.id ?? null)
  const environment = createEnvironmentSessionStore()
  const rendered = render(
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={session}>
          <SelectionProvider store={selection}>
            <ActiveFloorProvider store={activeFloor}>
              <EnvironmentSessionProvider store={environment}>
                <ActiveToolProvider>
                  <EditLayerProvider>
                    <ToolRail />
                  </EditLayerProvider>
                </ActiveToolProvider>
              </EnvironmentSessionProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>,
  )
  return { ...rendered, session }
}

// Cycle 1 (editor/shell/tool-rail.css) declares the kerf rule; cycle 2 pins that
// the rail actually applies it to the Edit layer section and nowhere else.
describe('ToolRail sections', () => {
  afterEach(cleanup)

  it('wraps the Edit layer radiogroup in the kerf-separated section', () => {
    renderRail()

    const editLayer = screen.getByRole('radiogroup', { name: /edit layer/i })
    expect(editLayer.closest('.tool-rail__edit-layer')).not.toBeNull()
  })

  it('keeps the Tools nav outside the kerf-separated section', () => {
    renderRail()

    const toolsNav = screen.getByRole('navigation', { name: /tools/i })
    expect(toolsNav.closest('.tool-rail__edit-layer')).toBeNull()
  })

  it('does not apply the kerf-separated wrapper to a standalone EditLayerPanel', () => {
    // Pins that the wrapper class belongs to the rail's composition, not to the
    // panel itself, so this case already passes.
    render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    const editLayer = screen.getByRole('radiogroup', { name: /edit layer/i })
    expect(editLayer.closest('.tool-rail__edit-layer')).toBeNull()
  })
})

describe('ToolRail environment section opening light', () => {
  afterEach(cleanup)

  const USE_BUTTON = /use this light when the project opens/i
  const DEFAULT_STORE_LIGHT = { observedAt: '2026-03-20T10:30', weather: { cloudCover: 0 } }
  const STORED_STATUS = 'Opens at 20 March 2026, 10:30, clear sky.'

  it('places the use-this-light button after the cloud cover slider and before the scene name field', () => {
    renderRail()

    const environment = screen.getByRole('region', { name: /environment/i })
    const button = within(environment).getByRole('button', { name: USE_BUTTON })
    const cloudCover = within(environment).getByLabelText(/cloud cover/i)
    const sceneName = within(environment).getByLabelText(/scene name/i)
    expect(
      cloudCover.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      button.compareDocumentPosition(sceneName) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('stores the light on screen in the project and reads it back when the button is clicked', async () => {
    const user = userEvent.setup()
    const { session } = renderRail()

    await user.click(screen.getByRole('button', { name: USE_BUTTON }))

    expect(session.getProject().openingLight).toEqual(DEFAULT_STORE_LIGHT)
    expect(screen.getByText(STORED_STATUS)).toBeInTheDocument()
  })
})
