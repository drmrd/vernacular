import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  isOpeningOpen,
  setOpeningType,
  type OpenParts,
} from '../../core'
import { buildScene, NeutralMaterialProvider, type SceneRoot } from '../../engine'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { createSceneSessionStore, SceneSessionProvider } from '../index'
import { createEditorSession } from '../../session/testing'
import { ActiveFloorProvider } from './active-floor-provider'
import { EditorSessionProvider } from './editor-session-provider'
import { openPartsWith } from '../open-parts-test-support'
import { tickOpeningMotion, useOpeningMotion } from './use-opening-motion'
import { viewSceneGraph } from './view-scene-graph'

afterEach(cleanup)

const GROUND_ID = 'floor-ground'
const UPPER_ID = 'floor-upper'
const UPPER_ELEVATION_MM = 3000
const WALL_LENGTH_MM = 4000
const WINDOW_POSITION_MM = 2000

// A whole-second tick covers the full travel in one step.
const FULL_STEP = 1

function floorWithHungWindow(floorId: string, elevation: number) {
  const wallId = `wall-of-${floorId}`
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: wallId })
  const floor = createFloor(floorId, { id: floorId, elevation, walls: [wall] })
  floor.openings.push(
    createOpening({
      type: 'double-hung-window',
      hostWallId: wallId,
      position: WINDOW_POSITION_MM,
    }),
  )
  return floor
}

// A project with a hung window on each of two floors, the ground floor active, one floor shown.
function environment() {
  const project = createEmptyProject({
    name: 'Two windows',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors.push(
    floorWithHungWindow(GROUND_ID, 0),
    floorWithHungWindow(UPPER_ID, UPPER_ELEVATION_MM),
  )
  const session = createEditorSession(project)
  const activeFloor = createActiveFloorStore(GROUND_ID)
  const sceneSession = createSceneSessionStore({ scope: 'floor' })
  const windowOn = (floorId: string): string => {
    const found = session.getSceneGraph().openings.find((opening) => opening.floorId === floorId)
    if (found === undefined) throw new Error(`the scene graph holds no window on ${floorId}`)
    return found.id
  }
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
        scope: 'floor',
        activeFloorId: activeFloor.getActiveFloorId(),
        includeUnderground: true,
        cameraMode: sceneSession.getSceneSession().cameraMode,
      }),
      new NeutralMaterialProvider(),
    )
  const retype = (floorId: string, type: string): void => {
    act(() => {
      session.dispatch(setOpeningType(floorId, windowOn(floorId), type))
    })
  }
  return { windowOn, wrapper, buildRoot, retype, activeFloor }
}

function renderMotion(env: ReturnType<typeof environment>, stored: OpenParts) {
  const root = env.buildRoot()
  return renderHook(() => useOpeningMotion(root, stored), { wrapper: env.wrapper })
}

describe('useOpeningMotion after an opening is retyped', () => {
  it('a retype drops the open parts the new type lacks', () => {
    const env = environment()
    const windowId = env.windowOn(GROUND_ID)
    const stored = openPartsWith({ [windowId]: ['upper', 'lower'] })
    const { result } = renderMotion(env, stored)

    env.retype(GROUND_ID, 'single-hung-window')

    expect(result.current.interaction.current.openParts.get(windowId)).toEqual(new Set(['lower']))
  })

  it('reads no opening as open once a retype leaves only parts its new type lacks', () => {
    const env = environment()
    const windowId = env.windowOn(GROUND_ID)
    const stored = openPartsWith({ [windowId]: ['upper'] })
    const { result } = renderMotion(env, stored)

    env.retype(GROUND_ID, 'single-swing-door')

    expect(isOpeningOpen(result.current.interaction.current, windowId)).toBe(false)
  })

  it('settles an unshown window retyped to single-hung at the full rise of its lower sash', () => {
    const env = environment()
    const windowId = env.windowOn(UPPER_ID)
    env.activeFloor.setActiveFloorId(UPPER_ID)
    const root = env.buildRoot()
    const stored = openPartsWith({ [windowId]: ['upper', 'lower'] })
    const { result } = renderHook(() => useOpeningMotion(root, stored), { wrapper: env.wrapper })
    tickOpeningMotion(root, result.current, FULL_STEP)
    act(() => env.activeFloor.setActiveFloorId(GROUND_ID))

    env.retype(UPPER_ID, 'single-hung-window')

    expect(result.current.openness.current.get(windowId)?.lower).toBe(1)
  })
})
