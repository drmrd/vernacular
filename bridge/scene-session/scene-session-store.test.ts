import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_COLOR_TEMPERATURE_K, type CameraPose, type WalkState } from '../../core'
import { createSceneSessionStore, type SceneSessionState } from './scene-session-store'

const samplePosition = { x: 240, y: 90, z: -160 }

const samplePresetPose: CameraPose = {
  position: samplePosition,
  target: { x: 0, y: 0, z: 0 },
  near: 10,
  far: 4000,
}

const sampleWalkPose: WalkState = { position: samplePosition, yaw: 0.75, pitch: -0.25 }

const defaultSceneSession: SceneSessionState = {
  cameraMode: 'orbit',
  selectionEnabled: true,
  revealInterior: true,
  presetPose: null,
  colorTemperatureK: DEFAULT_COLOR_TEMPERATURE_K,
  scope: 'floor',
  showUnderground: true,
  edgeOverlay: false,
  openDoorIds: new Set<string>(),
  savedCameraPosition: null,
  walkPose: null,
  sessionRestored: false,
  frameDrawnSincePipelineSettled: false,
}

describe('createSceneSessionStore', () => {
  it('starts every part of the 3D session at its default', () => {
    const session = createSceneSessionStore().getSceneSession()

    expect(session).toEqual(defaultSceneSession)
    expect(session.openDoorIds.size).toBe(0)
  })

  it('honors the fields the caller seeds and leaves the rest at their defaults', () => {
    const session = createSceneSessionStore({
      cameraMode: 'walk',
      edgeOverlay: true,
    }).getSceneSession()

    expect(session).toEqual({ ...defaultSceneSession, cameraMode: 'walk', edgeOverlay: true })
  })

  it('merges an update into a fresh snapshot and leaves the other fields alone', () => {
    const store = createSceneSessionStore()
    const before = store.getSceneSession()

    store.updateSceneSession({ walkPose: sampleWalkPose })

    const after = store.getSceneSession()
    expect(after).toEqual({ ...defaultSceneSession, walkPose: sampleWalkPose })
    expect(after).not.toBe(before)
    expect(before.walkPose).toBeNull()
  })

  it('notifies a subscriber once per update that changes something, and never for one that does not', () => {
    const store = createSceneSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.updateSceneSession({ presetPose: samplePresetPose })
    expect(listener).toHaveBeenCalledTimes(1)

    store.updateSceneSession({ cameraMode: 'orbit' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a subscriber once it unsubscribes', () => {
    const store = createSceneSessionStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.updateSceneSession({ edgeOverlay: true })

    expect(listener).not.toHaveBeenCalled()
  })
})
