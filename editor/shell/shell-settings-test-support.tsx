import type { ReactNode } from 'react'
import { ShellProviders } from './shell-providers'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createSelectionStore,
} from '../../bridge'
import { createEditorSession } from '../../session/testing'
import { createEmptyProject, createFloor, type Project } from '../../core'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'
import { SnapProbe } from './shell-snap-probe-test-support'

/** Shared set-up of the tests of the snap preferences of the shell. */

/** The name that the snap preferences are kept under in the settings. */
export const SETTING_NAME = 'snapPreferences'

const FLOOR_ID = 'ground'

function projectWithOneFloor(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: FLOOR_ID })]
  return project
}

/** The editor's providers around the shell providers, as the application stacks them, with the probe inside. */
export function shellWithProbe(): ReactNode {
  const session = createEditorSession(projectWithOneFloor())
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore(FLOOR_ID)
  return (
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={session}>
          <SelectionProvider store={selection}>
            <ActiveFloorProvider store={activeFloor}>
              <ActiveToolProvider>
                <EditLayerProvider>
                  <ShellProviders>
                    <SnapProbe />
                  </ShellProviders>
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>
  )
}
