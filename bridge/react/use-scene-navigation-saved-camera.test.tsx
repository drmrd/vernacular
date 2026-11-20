import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import type { SavedCamera } from '../scene-session/scene-session-store'
import { useSceneNavigation } from './use-scene-navigation'

const SAVED_CAMERA: SavedCamera = {
  position: { x: 4, y: 5, z: 6 },
  orbitTarget: { x: 7, y: 8, z: 9 },
}

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function renderNavigationOn(store: SceneSessionStore) {
  return renderHook(() => useSceneNavigation(), { wrapper: providerAround(store) })
}

describe('useSceneNavigation saved camera inside a scene session provider', () => {
  it('reads a saved camera as the user already steering, so a remount leaves it alone', () => {
    const steeredStore = createSceneSessionStore({ savedCamera: SAVED_CAMERA })
    const unsteeredStore = createSceneSessionStore()

    const steered = renderNavigationOn(steeredStore)
    const unsteered = renderNavigationOn(unsteeredStore)

    expect(steered.result.current.userControlled).toBe(true)
    expect(unsteered.result.current.userControlled).toBe(false)
  })

  it('offers no camera for a fresh session and the saved one once the session holds it', () => {
    const freshStore = createSceneSessionStore()
    const steeredStore = createSceneSessionStore({ savedCamera: SAVED_CAMERA })

    const fresh = renderNavigationOn(freshStore)
    const steered = renderNavigationOn(steeredStore)

    expect(fresh.result.current.savedCamera).toBeNull()
    expect(steered.result.current.savedCamera).toEqual(SAVED_CAMERA)
  })

  it('hands a remounted navigation the camera position and orbit target a steered mount noted', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.markUserControlled()
    })
    act(() => {
      firstMount.result.current.noteCameraLeft(SAVED_CAMERA)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().savedCamera).toEqual(SAVED_CAMERA)
    expect(secondMount.result.current.savedCamera).toEqual(SAVED_CAMERA)
  })

  it('forgets the camera of a pane the user never steered, so the next mount frames the model again', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.noteCameraLeft(SAVED_CAMERA)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().savedCamera).toBeNull()
    expect(secondMount.result.current.userControlled).toBe(false)
  })

  it('forgets the saved camera after Reset view, so the next mount frames the model again', () => {
    const store = createSceneSessionStore({ savedCamera: SAVED_CAMERA })
    const firstMount = renderNavigationOn(store)
    expect(firstMount.result.current.userControlled).toBe(true)

    act(() => {
      firstMount.result.current.resetView()
    })
    act(() => {
      firstMount.result.current.noteCameraLeft(SAVED_CAMERA)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().savedCamera).toBeNull()
    expect(secondMount.result.current.userControlled).toBe(false)
  })

  it('keeps the camera of a pane steered by a camera preset alone', () => {
    const store = createSceneSessionStore()
    const firstMount = renderNavigationOn(store)

    act(() => {
      firstMount.result.current.applyPreset('top')
    })
    act(() => {
      firstMount.result.current.noteCameraLeft(SAVED_CAMERA)
    })
    firstMount.unmount()

    const secondMount = renderNavigationOn(store)

    expect(store.getSceneSession().savedCamera).toEqual(SAVED_CAMERA)
    expect(secondMount.result.current.userControlled).toBe(true)
  })
})
