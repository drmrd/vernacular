import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

import { createEmptyProject, createFloor, createOpening, createWall } from '../../core'
import { buildScene, NeutralMaterialProvider, type SceneRoot } from '../../engine'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { createEditorSession } from '../../session/testing'
import { ActiveFloorProvider } from './active-floor-provider'
import { EditorSessionProvider } from './editor-session-provider'
import { tickOpeningMotion, useOpeningMotion } from './use-opening-motion'

afterEach(cleanup)

const FLOOR_ID = 'floor-ground'
const WALL_ID = 'wall-south'
const WALL_LENGTH_MM = 4000
const DOOR_POSITION_MM = 2000

// A whole-second tick covers the full swing in one step.
const FULL_STEP = 1

// A project whose ground floor holds one wall with one door in it.
function sessionWithOneDoor() {
  const project = createEmptyProject({
    name: 'One door',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: WALL_ID })
  const floor = createFloor('Ground', { id: FLOOR_ID, walls: [wall] })
  floor.openings.push(
    createOpening({ type: 'single-swing-door', hostWallId: WALL_ID, position: DOOR_POSITION_MM }),
  )
  project.floors.push(floor)
  return createEditorSession(project)
}

function hookEnvironment() {
  const session = sessionWithOneDoor()
  const doorId = session.getSceneGraph().openings[0]?.id
  if (doorId === undefined) {
    throw new Error('the scene graph holds no door')
  }
  const activeFloor = createActiveFloorStore(FLOOR_ID)
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <EditorSessionProvider session={session}>
        <ActiveFloorProvider store={activeFloor}>{children}</ActiveFloorProvider>
      </EditorSessionProvider>
    )
  }
  const buildRoot = (): SceneRoot =>
    buildScene(session.getSceneGraph(), new NeutralMaterialProvider())
  return { doorId, wrapper, buildRoot }
}

// The pose a door's fill group sits at, as plain numbers, so two independently built
// scenes can be compared for the same pose.
function fillGroupPose(root: SceneRoot, openingId: string) {
  const group = root.getObjectByName(openingId)
  if (group === undefined) {
    throw new Error(`no fill group was built for ${openingId}`)
  }
  return {
    position: { x: group.position.x, y: group.position.y, z: group.position.z },
    rotationY: group.rotation.y,
  }
}

interface HookProps {
  root: SceneRoot
  stored: ReadonlySet<string>
}

function renderMotion(env: ReturnType<typeof hookEnvironment>, initial: HookProps) {
  return renderHook(({ root, stored }: HookProps) => useOpeningMotion(root, stored), {
    wrapper: env.wrapper,
    initialProps: initial,
  })
}

// The poses of one door when it is shut and when it is fully open, read from scenes
// that no hook has touched.
function builtAndOpenPoses(env: ReturnType<typeof hookEnvironment>) {
  const shut = env.buildRoot()
  const open = env.buildRoot()
  const probe = renderMotion(env, { root: open, stored: new Set([env.doorId]) })
  tickOpeningMotion(open, probe.result.current, FULL_STEP)
  probe.unmount()
  const shutPose = fillGroupPose(shut, env.doorId)
  const openPose = fillGroupPose(open, env.doorId)
  expect(openPose).not.toEqual(shutPose)
  return { shutPose, openPose }
}

describe('useOpeningMotion', () => {
  it('poses a new root at the open pose its door carried, before any tick', () => {
    const env = hookEnvironment()
    const { openPose } = builtAndOpenPoses(env)
    const rootA = env.buildRoot()
    const stored = new Set([env.doorId])
    const { result, rerender } = renderMotion(env, { root: rootA, stored })
    tickOpeningMotion(rootA, result.current, FULL_STEP)
    expect(fillGroupPose(rootA, env.doorId)).toEqual(openPose)

    const rootB = env.buildRoot()
    rerender({ root: rootB, stored })

    expect(fillGroupPose(rootB, env.doorId)).toEqual(openPose)
  })

  it('swings a door that was open back to its built pose once the stored set is emptied', () => {
    const env = hookEnvironment()
    const { shutPose, openPose } = builtAndOpenPoses(env)
    const root = env.buildRoot()
    const { result, rerender } = renderMotion(env, { root, stored: new Set([env.doorId]) })
    tickOpeningMotion(root, result.current, FULL_STEP)
    expect(fillGroupPose(root, env.doorId)).toEqual(openPose)

    rerender({ root, stored: new Set() })
    tickOpeningMotion(root, result.current, FULL_STEP)

    expect(fillGroupPose(root, env.doorId)).toEqual(shutPose)
  })

  it('shuts a new root when it arrives in the same render as an emptied stored set', () => {
    const env = hookEnvironment()
    const { shutPose, openPose } = builtAndOpenPoses(env)
    const rootA = env.buildRoot()
    const { result, rerender } = renderMotion(env, { root: rootA, stored: new Set([env.doorId]) })
    tickOpeningMotion(rootA, result.current, FULL_STEP)
    expect(fillGroupPose(rootA, env.doorId)).toEqual(openPose)

    const rootB = env.buildRoot()
    rerender({ root: rootB, stored: new Set() })
    // The door has not swung yet, so its carried openness still reads as open and the new
    // root is posed open. Only the tick that follows swings it shut.
    expect(fillGroupPose(rootB, env.doorId)).toEqual(openPose)
    tickOpeningMotion(rootB, result.current, FULL_STEP)

    expect(fillGroupPose(rootB, env.doorId)).toEqual(shutPose)
  })

  it('opens a new root when it arrives in the same render as a stored set that holds the door', () => {
    const env = hookEnvironment()
    const { shutPose, openPose } = builtAndOpenPoses(env)
    const rootA = env.buildRoot()
    const { result, rerender } = renderMotion(env, { root: rootA, stored: new Set() })
    tickOpeningMotion(rootA, result.current, FULL_STEP)
    expect(fillGroupPose(rootA, env.doorId)).toEqual(shutPose)

    const rootB = env.buildRoot()
    rerender({ root: rootB, stored: new Set([env.doorId]) })
    // The door carries no openness yet, but the session holds it open, so the new root seats
    // it fully open at once, before any tick.
    expect(fillGroupPose(rootB, env.doorId)).toEqual(openPose)
    tickOpeningMotion(rootB, result.current, FULL_STEP)

    expect(fillGroupPose(rootB, env.doorId)).toEqual(openPose)
  })
})
