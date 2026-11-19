import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { expect } from 'vitest'

import { createEmptyProject, createFloor, createOpening, createWall } from '../../core'
import { buildScene, NeutralMaterialProvider, type SceneRoot } from '../../engine'
import { createActiveFloorStore, type ActiveFloorStore } from '../active-floor/active-floor-store'
import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import { createEditorSession } from '../../session/testing'
import { ActiveFloorProvider } from './active-floor-provider'
import { EditorSessionProvider } from './editor-session-provider'
import { tickOpeningMotion, useOpeningMotion } from './use-opening-motion'
import { viewSceneGraph, type SceneScope } from './view-scene-graph'

export const FLOOR_A_ID = 'floor-a'
export const FLOOR_B_ID = 'floor-b'

const FLOOR_B_ELEVATION_MM = 3000
const WALL_LENGTH_MM = 4000
const DOOR_POSITION_MM = 2000

// A whole-second tick covers the full swing in one step.
export const FULL_STEP = 1

function floorWithOneDoor(floorId: string, elevation: number) {
  const wallId = `wall-of-${floorId}`
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: wallId })
  const floor = createFloor(floorId, { id: floorId, elevation, walls: [wall] })
  floor.openings.push(
    createOpening({ type: 'single-swing-door', hostWallId: wallId, position: DOOR_POSITION_MM }),
  )
  return floor
}

// A project with two floors, A at elevation 0 and B at 3000, each holding one wall with one door.
function twoFloorSession() {
  const project = createEmptyProject({
    name: 'Two floors',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors.push(
    floorWithOneDoor(FLOOR_A_ID, 0),
    floorWithOneDoor(FLOOR_B_ID, FLOOR_B_ELEVATION_MM),
  )
  return createEditorSession(project)
}

export interface TwoFloorEnvironment {
  doorAId: string
  doorBId: string
  activeFloor: ActiveFloorStore
  sceneSession: SceneSessionStore
  wrapper: (props: { children: ReactNode }) => ReactNode
  /** Builds a root over what the view shows now: the scope and active floor the stores hold. */
  buildRoot: () => SceneRoot
}

function doorIdOn(session: ReturnType<typeof twoFloorSession>, floorId: string): string {
  const door = session.getSceneGraph().openings.find((opening) => opening.floorId === floorId)
  if (door === undefined) {
    throw new Error(`the scene graph holds no door on ${floorId}`)
  }
  return door.id
}

/** The two-floor project under the real providers, with floor A active in the given scope. */
export function twoFloorEnvironment(scope: SceneScope): TwoFloorEnvironment {
  const session = twoFloorSession()
  const activeFloor = createActiveFloorStore(FLOOR_A_ID)
  const sceneSession = createSceneSessionStore({ scope })
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <EditorSessionProvider session={session}>
        <SceneSessionProvider store={sceneSession}>
          <ActiveFloorProvider store={activeFloor}>{children}</ActiveFloorProvider>
        </SceneSessionProvider>
      </EditorSessionProvider>
    )
  }
  const buildRoot = (): SceneRoot =>
    buildScene(
      viewSceneGraph({
        rawGraph: session.getSceneGraph(),
        scope: sceneSession.getSceneSession().scope,
        activeFloorId: activeFloor.getActiveFloorId(),
        includeUnderground: true,
      }),
      new NeutralMaterialProvider(),
    )
  return {
    doorAId: doorIdOn(session, FLOOR_A_ID),
    doorBId: doorIdOn(session, FLOOR_B_ID),
    activeFloor,
    sceneSession,
    wrapper,
    buildRoot,
  }
}

export interface HookProps {
  root: SceneRoot
  stored: ReadonlySet<string>
}

/** Renders the opening motion hook under the environment's providers. */
export function renderMotion(env: TwoFloorEnvironment, initial: HookProps) {
  return renderHook(({ root, stored }: HookProps) => useOpeningMotion(root, stored), {
    wrapper: env.wrapper,
    initialProps: initial,
  })
}

// The pose a door's fill group sits at, as plain numbers, so two independently built
// scenes can be compared for the same pose.
export function fillGroupPose(root: SceneRoot, openingId: string) {
  const group = root.getObjectByName(openingId)
  if (group === undefined) {
    throw new Error(`no fill group was built for ${openingId}`)
  }
  return {
    position: { x: group.position.x, y: group.position.y, z: group.position.z },
    rotationY: group.rotation.y,
  }
}

/** The pose of a door as built, on a root that no hook has touched. */
export function shutPoseOf(env: TwoFloorEnvironment, doorId: string) {
  return fillGroupPose(env.buildRoot(), doorId)
}

/**
 * Swings one door fully open on a root through a floor view with that floor active, then puts
 * the stores back as they were. The root keeps the open pose, as after a tick in a live view.
 */
export function seatDoorOpenOnRoot(
  env: TwoFloorEnvironment,
  root: SceneRoot,
  placement: { floorId: string; doorId: string },
) {
  const before = {
    scope: env.sceneSession.getSceneSession().scope,
    floorId: env.activeFloor.getActiveFloorId(),
  }
  env.sceneSession.updateSceneSession({ scope: 'floor' })
  env.activeFloor.setActiveFloorId(placement.floorId)
  const probe = renderMotion(env, { root, stored: new Set([placement.doorId]) })
  tickOpeningMotion(root, probe.result.current, FULL_STEP)
  probe.unmount()
  env.sceneSession.updateSceneSession({ scope: before.scope })
  env.activeFloor.setActiveFloorId(before.floorId)
  expect(fillGroupPose(root, placement.doorId)).not.toEqual(shutPoseOf(env, placement.doorId))
}
