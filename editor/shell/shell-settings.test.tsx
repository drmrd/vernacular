import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
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
import { createSettingsService, type SettingsService } from '../../session'
import { createEditorSession, InMemorySettingsPort } from '../../session/testing'
import { createEmptyProject, createFloor, type Project } from '../../core'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'
import { DEFAULT_SNAP_PREFERENCES } from '../plan/snap-preferences'
import { useSnapPreferences, useSnapPreferencesStore } from '../plan/snap-preferences-context'

/** The name that the snap preferences are kept under in the settings. */
const SETTING_NAME = 'snapPreferences'

const FLOOR_ID = 'ground'

let browserReads: MockInstance<Storage['getItem']>
let browserWrites: MockInstance<Storage['setItem']>
let browserRemovals: MockInstance<Storage['removeItem']>

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case can pass through it.
beforeEach(() => {
  browserReads = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  browserWrites = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  browserRemovals = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined)
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
function editorProviders(children: ReactNode): ReactNode {
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
                  <ShellProviders>{children}</ShellProviders>
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>
  )
}

/** Renders the shell providers with the probe inside, below the settings of `service` if one is given. */
function renderShell(service?: SettingsService) {
  const shell = editorProviders(<SnapProbe />)
  render(
    service === undefined ? shell : <SettingsProvider service={service}>{shell}</SettingsProvider>,
  )
}

describe('the snap preferences of the shell', () => {
  it('the shell starts with the snap preferences of the settings above it', () => {
    const port = new InMemorySettingsPort()
    port.write(SETTING_NAME, {
      ...DEFAULT_SNAP_PREFERENCES,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
    })

    renderShell(createSettingsService(port))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
  })

  it('a snap change in the shell reaches the settings port', () => {
    const port = new InMemorySettingsPort()
    renderShell(createSettingsService(port))

    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(port.read(SETTING_NAME)).toEqual({
      ...DEFAULT_SNAP_PREFERENCES,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
    })
  })

  it('with no settings above it the shell calls no browser storage', () => {
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(browserReads).not.toHaveBeenCalled()
    expect(browserWrites).not.toHaveBeenCalled()
    expect(browserRemovals).not.toHaveBeenCalled()
  })
})
