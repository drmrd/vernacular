import { describe, it, expect, vi } from 'vitest'
import { createSceneSessionStore } from '../index'
import { openPartsWith } from '../react/open-parts-test-support'
import { interactiveObjectsAtDefault, resetInteractiveObjects } from './interactive-objects'

const FRONT_DOOR_ID = 'opening:front-door'
const FRONT_DOOR_OPEN = openPartsWith({ [FRONT_DOOR_ID]: ['primary'] })

describe('resetInteractiveObjects', () => {
  it('closes every opened door and window, leaving the session at its defaults', () => {
    const store = createSceneSessionStore({ openDoorIds: FRONT_DOOR_OPEN })

    expect(interactiveObjectsAtDefault(store.getSceneSession())).toBe(false)

    resetInteractiveObjects(store)

    expect(store.getSceneSession().openDoorIds).toBeInstanceOf(Map)
    expect(store.getSceneSession().openDoorIds.size).toBe(0)
    expect(interactiveObjectsAtDefault(store.getSceneSession())).toBe(true)
  })

  it('replaces the stored open-parts map and never mutates the original in place', () => {
    const store = createSceneSessionStore({ openDoorIds: FRONT_DOOR_OPEN })
    const before = store.getSceneSession().openDoorIds

    resetInteractiveObjects(store)

    expect([...before.keys()]).toEqual([FRONT_DOOR_ID])
    expect(store.getSceneSession().openDoorIds).not.toBe(before)
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
      openDoorIds: FRONT_DOOR_OPEN,
    })

    resetInteractiveObjects(store)

    expect(store.getSceneSession().cameraMode).toBe('walk')
    expect(store.getSceneSession().edgeOverlay).toBe(true)
  })
})
