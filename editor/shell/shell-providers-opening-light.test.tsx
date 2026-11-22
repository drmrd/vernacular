import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ShellProviders } from './shell-providers'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createSelectionStore,
  useEnvironmentSession,
} from '../../bridge'
import { createEditorSession } from '../../session/testing'
import {
  DEFAULT_CLOUD_COVER,
  addWall,
  clearOpeningLight,
  createEmptyProject,
  createFloor,
  setOpeningLight,
  setSiteNorthBearing,
  type EnvironmentState,
  type ViewingConditions,
  type Site,
} from '../../core'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { EditLayerProvider } from '../tools/edit-layer-provider'
import { ThemeProvider } from '../design-system'
import { NotificationProvider } from '../design-system/notifications/use-notifications'

afterEach(cleanup)

type Session = ReturnType<typeof createEditorSession>

const FLOOR_ID = 'ground'
const ROOM_SIDE_MM = 3000
const NORTH_UP: Site = { northBearing: 0 }
const QUARTER_TURN = Math.PI / 2
const NORTH_TURNED_A_QUARTER: Site = { northBearing: QUARTER_TURN }

const SOUTH_FRONT_OPENING = { date: '2026-03-20', minutesSinceMidnight: 630 }
const WEST_FRONT_OPENING = { date: '2026-03-20', minutesSinceMidnight: 840 }

const STORED_CLOUD_COVER = 0.4
const STORED_LIGHT: ViewingConditions = {
  observedAt: '2026-06-21T08:00',
  weather: { cloudCover: STORED_CLOUD_COVER },
}
const STORED_OPENING = { date: '2026-06-21', minutesSinceMidnight: 480 }

const CORNERS = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE_MM, y: 0 },
  { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM },
  { x: 0, y: ROOM_SIDE_MM },
]

/** A session holding one closed room with no door, on a project with the given site. */
function sessionWithClosedRoom(site: Site): Session {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: FLOOR_ID })]
  project.site = site
  const session = createEditorSession(project)
  CORNERS.forEach((start, index) => {
    const end = CORNERS[(index + 1) % CORNERS.length]!
    session.dispatch(addWall(FLOOR_ID, start, end))
  })
  return session
}

/** Reports the environment the shell currently holds to the caller instead of rendering it. */
function EnvironmentProbe({ onValue }: { onValue: (value: EnvironmentState) => void }) {
  onValue(useEnvironmentSession().environment)
  return null
}

function shellAround(session: Session, onValue: (value: EnvironmentState) => void): ReactElement {
  return (
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={session}>
          <SelectionProvider store={createSelectionStore()}>
            <ActiveFloorProvider store={createActiveFloorStore(FLOOR_ID)}>
              <ActiveToolProvider>
                <EditLayerProvider>
                  <ShellProviders>
                    <EnvironmentProbe onValue={onValue} />
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

function expectSchematicAt(environment: EnvironmentState | undefined, observedAt: object) {
  expect(environment?.observedAt).toEqual(observedAt)
  expect(environment?.mode).toBe('schematic')
  expect(environment?.colorCheck).toBe(false)
}

describe('ShellProviders opening light', () => {
  it('seeds the light on screen from the project that opened, and leaves it when the site changes', () => {
    let latestEnvironment: EnvironmentState | undefined
    const session = sessionWithClosedRoom(NORTH_UP)
    const { rerender } = render(shellAround(session, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, SOUTH_FRONT_OPENING)

    session.dispatch(setSiteNorthBearing(QUARTER_TURN))
    rerender(shellAround(session, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, SOUTH_FRONT_OPENING)
  })

  it('gives a second project its own opening light from its own site', () => {
    let latestEnvironment: EnvironmentState | undefined
    const turnedSession = sessionWithClosedRoom(NORTH_TURNED_A_QUARTER)

    render(shellAround(turnedSession, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, WEST_FRONT_OPENING)
  })

  it('opens in the light the project stored, with its cloud cover', () => {
    let latestEnvironment: EnvironmentState | undefined
    const session = sessionWithClosedRoom(NORTH_UP)
    session.dispatch(setOpeningLight(STORED_LIGHT))

    render(shellAround(session, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, STORED_OPENING)
    expect(latestEnvironment?.cloudCover).toBe(STORED_CLOUD_COVER)
  })

  it('opens in the light chosen for the house again once the stored light is cleared', () => {
    let latestEnvironment: EnvironmentState | undefined
    const session = sessionWithClosedRoom(NORTH_UP)
    session.dispatch(setOpeningLight(STORED_LIGHT))
    const { unmount } = render(shellAround(session, (value) => (latestEnvironment = value)))
    expectSchematicAt(latestEnvironment, STORED_OPENING)
    unmount()

    session.dispatch(clearOpeningLight())
    render(shellAround(session, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, SOUTH_FRONT_OPENING)
    expect(latestEnvironment?.cloudCover).toBe(DEFAULT_CLOUD_COVER)
  })

  it('leaves the light on screen alone when a light is stored after the project opened', () => {
    let latestEnvironment: EnvironmentState | undefined
    const session = sessionWithClosedRoom(NORTH_UP)
    const { rerender } = render(shellAround(session, (value) => (latestEnvironment = value)))

    session.dispatch(setOpeningLight(STORED_LIGHT))
    rerender(shellAround(session, (value) => (latestEnvironment = value)))

    expectSchematicAt(latestEnvironment, SOUTH_FRONT_OPENING)
    expect(latestEnvironment?.cloudCover).toBe(DEFAULT_CLOUD_COVER)
  })
})
