// Test-only support for the inspector suites. Nothing outside a test imports this,
// so the @testing-library/react dependency never reaches the shipped bundle.
import { render } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  SurfaceSelectionProvider,
  createEditorSession,
  createSelectionStore,
  createActiveFloorStore,
  createSurfaceSelectionStore,
} from '../../bridge'
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
}

/**
 * Render the Inspector over a one-floor project (floor id `g`) wired through the
 * real session, selection, active-floor, and surface-selection stores, so tests
 * drive it the way the editor does. Returns the selection store to drive it with
 * and the editor session, so a test can undo or redo the way the editor does.
 */
export function renderInspector({
  walls = [],
  roomOverrides,
  stairs = [],
  dimensions = [],
  openings = [],
}: InspectorFixture = {}) {
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
  project.roomOverrides = roomOverrides
  project.stairs = stairs
  const session = createEditorSession(project)
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
  return { selection, session }
}
