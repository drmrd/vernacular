import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'

import { createEmptyProject, createFloor, createWall } from '../../core'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { createSceneSessionStore, SceneSessionProvider } from '../index'
import { createEditorSession } from '../../session/testing'
import { ActiveFloorProvider } from './active-floor-provider'
import { EditorSessionProvider } from './editor-session-provider'
import { useShownSceneGraph } from './use-view-scene-graph'

afterEach(cleanup)

const BASEMENT_ID = 'basement'
const GROUND_ID = 'ground'
const BASEMENT_ELEVATION_MM = -3000
const WALL_LENGTH_MM = 4000

function floorWithWall(floorId: string, elevation: number) {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: `wall-of-${floorId}` })
  return createFloor(floorId, { id: floorId, elevation, walls: [wall] })
}

// A basement below grade and a ground floor at grade, the basement active, walking in a
// whole-building view that hides underground levels.
function walkingFromTheBasement() {
  const project = createEmptyProject({
    name: 'Basement and ground',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors.push(
    floorWithWall(BASEMENT_ID, BASEMENT_ELEVATION_MM),
    floorWithWall(GROUND_ID, 0),
  )
  const session = createEditorSession(project)
  const sceneSession = createSceneSessionStore({
    scope: 'building',
    showUnderground: false,
    cameraMode: 'walk',
  })
  const activeFloor = createActiveFloorStore(BASEMENT_ID)
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <EditorSessionProvider session={session}>
        <SceneSessionProvider store={sceneSession}>
          <ActiveFloorProvider store={activeFloor}>{children}</ActiveFloorProvider>
        </SceneSessionProvider>
      </EditorSessionProvider>
    )
  }
  return { sceneSession, wrapper }
}

describe('useShownSceneGraph', () => {
  it('draws the hidden active floor while walking and drops it again when the walk ends', () => {
    const { sceneSession, wrapper } = walkingFromTheBasement()
    const { result } = renderHook(() => useShownSceneGraph(), { wrapper })
    const floorsDrawn = () => result.current.graph.walls.map((wall) => wall.floorId)

    expect(floorsDrawn()).toContain(BASEMENT_ID)

    act(() => sceneSession.updateSceneSession({ cameraMode: 'orbit' }))

    expect(floorsDrawn()).toEqual([GROUND_ID])
  })
})
