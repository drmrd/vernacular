import { describe, it, expect, vi } from 'vitest'
import { createSceneSessionStore } from '../index'
import { interactiveObjectsAtDefault, resetInteractiveObjects } from './interactive-objects'

const FRONT_DOOR_ID = 'opening:front-door'

describe('resetInteractiveObjects', () => {
  it('closes every opened door and window, leaving the session at its defaults', () => {
    const store = createSceneSessionStore({ openDoorIds: new Set([FRONT_DOOR_ID]) })

    expect(interactiveObjectsAtDefault(store.getSceneSession())).toBe(false)

    resetInteractiveObjects(store)

    expect(store.getSceneSession().openDoorIds.size).toBe(0)
    expect(interactiveObjectsAtDefault(store.getSceneSession())).toBe(true)
  })

  it('replaces the stored open set and never mutates the original in place', () => {
    const seed = new Set([FRONT_DOOR_ID])
    const store = createSceneSessionStore({ openDoorIds: seed })

    resetInteractiveObjects(store)

    expect([...seed]).toEqual([FRONT_DOOR_ID])
    expect(store.getSceneSession().openDoorIds).not.toBe(seed)
  })

  it('notifies no subscriber when nothing is open, because nothing changes', () => {
    const store = createSceneSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)

    resetInteractiveObjects(store)

    expect(listener).not.toHaveBeenCalled()
  })

  it('leaves unrelated session fields alone', () => {
    const store = createSceneSessionStore({
      cameraMode: 'walk',
      edgeOverlay: true,
      openDoorIds: new Set([FRONT_DOOR_ID]),
    })

    resetInteractiveObjects(store)

    expect(store.getSceneSession().cameraMode).toBe('walk')
    expect(store.getSceneSession().edgeOverlay).toBe(true)
  })
})
