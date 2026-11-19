import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ShellProviders } from './shell-providers'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  SettingsProvider,
  createActiveFloorStore,
  createSelectionStore,
} from '../../bridge'
import { createSettingsService } from '../../session'
import { createEditorSession, InMemorySettingsPort } from '../../session/testing'
import { createEmptyProject, createFloor, type Project } from '../../core'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'
import { DEFAULT_SNAP_PREFERENCES, type SnapPreferences } from '../plan/snap-preferences'
import { useSnapPreferences, useSnapPreferencesStore } from '../plan/snap-preferences-context'

/** The name that the snap preferences are kept under in the settings. */
const SETTING_NAME = 'snapPreferences'

const FLOOR_ID = 'ground'

/** A catch radius that the first service holds and no default has, so that its port is told apart. */
const RADIUS_OF_A = 30

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case can pass through it.
beforeEach(() => {
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

/** Shows the grid snapping of the shell's snap preferences, and turns it over on a click. */
function SnapProbe() {
  const preferences = useSnapPreferences()
  const store = useSnapPreferencesStore()
  return (
    <button type="button" onClick={() => store.toggleKind('grid')}>
      {preferences.kinds.grid ? 'Grid snapping on' : 'Grid snapping off'}
    </button>
  )
}

/** The editor's providers around the shell providers, as the application stacks them. */
function shellWithProbe(): ReactNode {
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

/** Preferences like the defaults, with grid snapping set to `grid`. */
function preferencesWithGrid(grid: boolean): SnapPreferences {
  return { ...DEFAULT_SNAP_PREFERENCES, kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid } }
}

describe('the snap preferences of the shell when the settings above it change', () => {
  it('shows the value of the new service, and a change reaches the new port only', () => {
    const storedByA: SnapPreferences = { ...preferencesWithGrid(false), pixelRadius: RADIUS_OF_A }
    const portA = new InMemorySettingsPort()
    portA.write(SETTING_NAME, storedByA)
    const portB = new InMemorySettingsPort()
    portB.write(SETTING_NAME, preferencesWithGrid(true))
    const shell = shellWithProbe()
    const { rerender } = render(
      <SettingsProvider service={createSettingsService(portA)}>{shell}</SettingsProvider>,
    )
    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()

    rerender(<SettingsProvider service={createSettingsService(portB)}>{shell}</SettingsProvider>)

    expect(screen.getByRole('button', { name: 'Grid snapping on' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))
    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(portB.read(SETTING_NAME)).toEqual(preferencesWithGrid(false))
    expect(portA.read(SETTING_NAME)).toEqual(storedByA)
  })
})
