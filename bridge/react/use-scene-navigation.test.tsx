import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import type { CameraPose, Vector3, WalkState } from '../../core'
import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import { useSceneNavigation } from './use-scene-navigation'

const SOME_POSE: CameraPose = {
  position: { x: 1, y: 2, z: 3 },
  target: { x: 0, y: 0, z: 0 },
  near: 0.1,
  far: 100,
}

const SAVED_CAMERA_POSITION: Vector3 = { x: 4, y: 5, z: 6 }

const SAMPLE_WALK_POSE: WalkState = {
  position: { x: 1200, y: 4700, z: -800 },
  yaw: 1.25,
  pitch: -0.4,
}

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function renderNavigationOn(store: SceneSessionStore) {
  return renderHook(() => useSceneNavigation(), { wrapper: providerAround(store) })
}

describe('useSceneNavigation', () => {
  it('reports no applied preset pose for a fresh navigation, so the camera pivots on the model framing', () => {
    const { result } = renderHook(() => useSceneNavigation())

    expect(result.current.presetPose).toBeNull()
  })

  it('exposes a noted preset pose as the pose the camera now pivots on', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.notePresetApplied(SOME_POSE)
    })

    expect(result.current.presetPose).toEqual(SOME_POSE)
  })

  it('clears the recorded preset pose on reset, so the pivot returns to the model framing', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.notePresetApplied(SOME_POSE)
    })
    act(() => {
      result.current.resetView()
    })

    expect(result.current.presetPose).toBeNull()
  })

  it('takes camera control and requests the named preset when a preset is applied', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.applyPreset('north')
    })

    expect(result.current.userControlled).toBe(true)
    expect(result.current.presetRequest?.preset).toBe('north')
  })

  it('issues a fresh request nonce when the same preset is re-picked, so the camera snaps again', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.applyPreset('north')
    })
    const firstNonce = result.current.presetRequest?.nonce

    act(() => {
      result.current.applyPreset('north')
    })

    expect(result.current.presetRequest?.preset).toBe('north')
    expect(result.current.presetRequest?.nonce).not.toBe(firstNonce)
  })

  it('enables click selection for a freshly mounted navigation, so a first click can select something', () => {
    const { result } = renderHook(() => useSceneNavigation())

    expect(result.current.selectionEnabled).toBe(true)
  })
})

describe('useSceneNavigation inside a scene session provider', () => {
  it('starts from the camera mode, the toggles, and the preset pose the session already holds', () => {
    const store = createSceneSessionStore({
      cameraMode: 'walk',
      selectionEnabled: false,
      revealInterior: false,
      presetPose: SOME_POSE,
    })

    const { result } = renderNavigationOn(store)

    expect(result.current.mode).toBe('walk')
    expect(result.current.selectionEnabled).toBe(false)
    expect(result.current.revealInterior).toBe(false)
    expect(result.current.presetPose).toEqual(SOME_POSE)
  })

  it('records a mode switch, both toggles, and an applied preset in the session', () => {
    const store = createSceneSessionStore()
    const { result } = renderNavigationOn(store)

    act(() => {
      result.current.setMode('walk')
    })
    act(() => {
      result.current.toggleSelection()
    })
    act(() => {
      result.current.toggleRevealInterior()
    })
    act(() => {
      result.current.notePresetApplied(SOME_POSE)
    })

    expect(store.getSceneSession()).toMatchObject({
      cameraMode: 'walk',
      selectionEnabled: false,
      revealInterior: false,
      presetPose: SOME_POSE,
    })
  })

  it('clears the stored preset pose on reset, so a later mount pivots on the model framing', () => {
    const store = createSceneSessionStore({ presetPose: SOME_POSE })
    const { result } = renderNavigationOn(store)

    act(() => {
      result.current.resetView()
    })

    expect(store.getSceneSession().presetPose).toBeNull()
  })

  it('hands a remounted navigation the camera mode and toggles the earlier mount left behind', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.setMode('walk')
    })
    act(() => {
      firstMount.result.current.toggleSelection()
    })
    act(() => {
      firstMount.result.current.toggleRevealInterior()
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(secondMount.result.current.mode).toBe('walk')
    expect(secondMount.result.current.selectionEnabled).toBe(false)
    expect(secondMount.result.current.revealInterior).toBe(false)
  })

  it('reads a saved camera position as the user already steering, so a remount leaves it alone', () => {
    const steeredStore = createSceneSessionStore({ savedCameraPosition: SAVED_CAMERA_POSITION })
    const unsteeredStore = createSceneSessionStore()

    const steered = renderNavigationOn(steeredStore)
    const unsteered = renderNavigationOn(unsteeredStore)

    expect(steered.result.current.userControlled).toBe(true)
    expect(unsteered.result.current.userControlled).toBe(false)
  })

  it('offers no camera position for a fresh session and the saved one once the session holds it', () => {
    const freshStore = createSceneSessionStore()
    const steeredStore = createSceneSessionStore({ savedCameraPosition: SAVED_CAMERA_POSITION })

    const fresh = renderNavigationOn(freshStore)
    const steered = renderNavigationOn(steeredStore)

    expect(fresh.result.current.savedCameraPosition).toBeNull()
    expect(steered.result.current.savedCameraPosition).toEqual(SAVED_CAMERA_POSITION)
  })

  it('hands a remounted navigation the camera position the departing mount noted', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.noteCameraLeft(SAVED_CAMERA_POSITION)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().savedCameraPosition).toEqual(SAVED_CAMERA_POSITION)
    expect(secondMount.result.current.savedCameraPosition).toEqual(SAVED_CAMERA_POSITION)
  })

  it('offers no walk pose for a fresh session and the saved one once the session holds it', () => {
    const freshStore = createSceneSessionStore()
    const touredStore = createSceneSessionStore({ walkPose: SAMPLE_WALK_POSE })

    const fresh = renderNavigationOn(freshStore)
    const toured = renderNavigationOn(touredStore)

    expect(fresh.result.current.walkPose).toBeNull()
    expect(toured.result.current.walkPose).toEqual(SAMPLE_WALK_POSE)
  })

  it('hands a remounted navigation the walk pose the departing walker noted', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.noteWalkPose(SAMPLE_WALK_POSE)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().walkPose).toEqual(SAMPLE_WALK_POSE)
    expect(secondMount.result.current.walkPose).toEqual(SAMPLE_WALK_POSE)
  })
})
