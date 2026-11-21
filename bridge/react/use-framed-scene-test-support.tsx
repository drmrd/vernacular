import { StrictMode, type ReactNode } from 'react'

import {
  FLOOR_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createWall,
  moveWallEndpoint,
} from '../../core'
import type { Wall } from '../../core'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { createSceneSessionStore, SceneSessionProvider } from '../index'
import { createEditorSession } from '../../session/testing'
import { ActiveFloorProvider } from './active-floor-provider'
import { EditorSessionProvider } from './editor-session-provider'

// A real editor session, scene session, and active floor under their real providers, so the
// framed-scene hook runs against the same wiring the live view has. The floor is a rectangle
// split by a partition, so it derives two rooms and an edit can rebuild them.

export const FLOOR_ID = 'g'
export const FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${FLOOR_ID}`
const PARTITION_ID = 'g-partition'
const WIDTH_MM = 6000
const HEIGHT_MM = 3000
const PARTITION_X_MM = 3000

function floorWalls(): Wall[] {
  const id = (name: string): { id: string } => ({ id: `g-${name}` })
  return [
    createWall({ x: 0, y: 0 }, { x: WIDTH_MM, y: 0 }, id('bottom')),
    createWall({ x: 0, y: HEIGHT_MM }, { x: WIDTH_MM, y: HEIGHT_MM }, id('top')),
    createWall({ x: 0, y: 0 }, { x: 0, y: HEIGHT_MM }, id('left')),
    createWall({ x: WIDTH_MM, y: 0 }, { x: WIDTH_MM, y: HEIGHT_MM }, id('right')),
    createWall(
      { x: PARTITION_X_MM, y: 0 },
      { x: PARTITION_X_MM, y: HEIGHT_MM },
      { id: PARTITION_ID },
    ),
  ]
}

export interface FramedSceneEnvironmentOptions {
  /** A project with no floors, so the shown graph is empty. */
  withoutFloors?: boolean
}

export interface FramedSceneEnvironment {
  wrapper: (props: { children: ReactNode }) => ReactNode
  /** The same providers inside React.StrictMode. */
  strictWrapper: (props: { children: ReactNode }) => ReactNode
  /** The scene-graph ids of the rooms the project derives right now. */
  roomIds(): string[]
  /** Slides the partition wall to a new x, which rebuilds the rooms on both sides of it. */
  movePartitionTo(xMm: number): void
}

export function framedSceneEnvironment(
  options: FramedSceneEnvironmentOptions = {},
): FramedSceneEnvironment {
  const project = createEmptyProject({
    name: 'Framed scene hook',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  if (options.withoutFloors !== true) {
    project.floors.push(createFloor('Ground', { id: FLOOR_ID, walls: floorWalls() }))
  }
  const session = createEditorSession(project)
  const sceneSession = createSceneSessionStore()
  const activeFloor = createActiveFloorStore(options.withoutFloors === true ? null : FLOOR_ID)
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <EditorSessionProvider session={session}>
        <SceneSessionProvider store={sceneSession}>
          <ActiveFloorProvider store={activeFloor}>{children}</ActiveFloorProvider>
        </SceneSessionProvider>
      </EditorSessionProvider>
    )
  }
  function strictWrapper({ children }: { children: ReactNode }) {
    return <StrictMode>{wrapper({ children })}</StrictMode>
  }
  return {
    wrapper,
    strictWrapper,
    roomIds: () => session.getSceneGraph().rooms.map((room) => room.id),
    movePartitionTo(xMm) {
      session.dispatch(moveWallEndpoint(FLOOR_ID, PARTITION_ID, 'start', { x: xMm, y: 0 }))
      session.dispatch(moveWallEndpoint(FLOOR_ID, PARTITION_ID, 'end', { x: xMm, y: HEIGHT_MM }))
    },
  }
}

/** Whether any edge-overlay line sits under the root, read structurally so the test stays off three. */
export function containsEdgeLines(root: {
  traverse(callback: (object: { type: string }) => void): void
}): boolean {
  let found = false
  root.traverse((object) => {
    if (object.type === 'LineSegments') found = true
  })
  return found
}
