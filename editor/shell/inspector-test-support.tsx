// Test-only support for the inspector suites. Nothing outside a test imports this,
// so the @testing-library/react dependency never reaches the shipped bundle.
import { render } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  SurfaceSelectionProvider,
  createSelectionStore,
  createActiveFloorStore,
  createSurfaceSelectionStore,
} from '../../bridge'
import { createEditorSession } from '../../session/testing'
import {
  createEmptyProject,
  createFloor,
  type Dimension,
  type Opening,
  type Project,
  type Wall,
} from '../../core'
import { Inspector } from './inspector'

/** The single-floor plan an inspector test renders against. Every part is optional. */
export interface InspectorFixture {
  walls?: Wall[]
  roomOverrides?: Project['roomOverrides']
  stairs?: Project['stairs']
  dimensions?: Dimension[]
  openings?: Opening[]
  /** An optional second floor (id `u`), stacked above the ground floor. */
  upperFloor?: { walls?: Wall[]; openings?: Opening[] }
}

function buildFixtureProject({
  walls = [],
  roomOverrides,
  stairs = [],
  dimensions = [],
  openings = [],
  upperFloor,
}: InspectorFixture): Project {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  // createFloor always starts a floor with no dimensions or openings, so a fixture
  // that needs them attaches them to the built floor rather than through the
  // factory options.
  const floor = createFloor('G', { id: 'g', walls })
  floor.dimensions = dimensions
  floor.openings = openings
  project.floors = [floor]
  if (upperFloor !== undefined) {
    const upper = createFloor('U', { id: 'u', walls: upperFloor.walls ?? [] })
    upper.openings = upperFloor.openings ?? []
    project.floors.push(upper)
  }
  project.roomOverrides = roomOverrides
  project.stairs = stairs
  return project
}

/**
 * Render the Inspector over a project whose ground floor has id `g` (and, when the
 * fixture asks for one, an upper floor with id `u`), wired through the real session,
 * selection, active-floor, and surface-selection stores, so tests drive it the way
 * the editor does. The ground floor starts active. Returns the selection store and
 * the active-floor store to drive it with, and the editor session, so a test can
 * undo or redo the way the editor does.
 */
export function renderInspector(fixture: InspectorFixture = {}) {
  const session = createEditorSession(buildFixtureProject(fixture))
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore('g')
  const surfaceSelection = createSurfaceSelectionStore()
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <SurfaceSelectionProvider store={surfaceSelection}>
            <Inspector />
          </SurfaceSelectionProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { selection, session, activeFloor }
}
