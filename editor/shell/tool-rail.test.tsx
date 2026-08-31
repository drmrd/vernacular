import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
  createEditorSession,
  createEnvironmentSessionStore,
  createSelectionStore,
} from '../../bridge'
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
  return render(
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
