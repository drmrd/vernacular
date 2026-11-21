import { render } from '@testing-library/react'
import { ActiveFloorContext, createActiveFloorStore, type EditorSession } from '../../bridge'
import { EditorSessionContext } from '../../bridge/react/editor-session-context'
import { ActiveToolProvider } from './active-tool-provider'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'

function floorStack(elevations: readonly number[]) {
  return elevations.map((elevation, index) => ({ id: `floor-${index}`, elevation }))
}

function sessionWithFloors(floors: ReturnType<typeof floorStack>) {
  return {
    subscribe: () => () => {},
    getProject: () => ({ floors }),
  } as unknown as EditorSession
}

// The panel inside a project, the way the editor shell mounts it: an editor session
// holding the floor stack and the active-floor store naming the floor in hand.
export function renderPanelInProject(elevations: readonly number[], activeFloorIndex: number) {
  return render(
    <EditorSessionContext.Provider value={sessionWithFloors(floorStack(elevations))}>
      <ActiveFloorContext.Provider value={createActiveFloorStore(`floor-${activeFloorIndex}`)}>
        <ActiveToolProvider>
          <OpeningToolProvider>
            <ToolsPanel />
          </OpeningToolProvider>
        </ActiveToolProvider>
      </ActiveFloorContext.Provider>
    </EditorSessionContext.Provider>,
  )
}
