import { describe, it, expect } from 'vitest'
import type { SurfaceRef } from '../../core'
import { createSurfaceSelectionStore } from './surface-selection-store'

const wallFaceLeft: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const floorOne: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }

describe('createSurfaceSelectionStore', () => {
  it('starts with no active surface', () => {
    const store = createSurfaceSelectionStore()

    expect(store.getActiveSurface()).toBeNull()
  })

  it('makes the selected surface the active surface', () => {
    const store = createSurfaceSelectionStore()

    store.select(wallFaceLeft)

    expect(store.getActiveSurface()).toEqual(wallFaceLeft)
    expect(store.isActive(wallFaceLeft)).toBe(true)
  })

  it('compares active surfaces by surface key, not object identity', () => {
    const store = createSurfaceSelectionStore()
    store.select(wallFaceLeft)

    const structurallyEqual: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
    expect(store.isActive(structurallyEqual)).toBe(true)
    expect(store.isActive(floorOne)).toBe(false)
  })

  it('replaces the prior active surface when selecting another', () => {
    const store = createSurfaceSelectionStore()

    store.select(wallFaceLeft)
    store.select(floorOne)

    expect(store.getActiveSurface()).toEqual(floorOne)
    expect(store.isActive(wallFaceLeft)).toBe(false)
  })

  it('clears the active surface', () => {
    const store = createSurfaceSelectionStore()
    store.select(wallFaceLeft)

    store.clear()

    expect(store.getActiveSurface()).toBeNull()
  })

  it('notifies subscribers on select and clear, and stops after unsubscribe', () => {
    const store = createSurfaceSelectionStore()
    let count = 0
    const unsubscribe = store.subscribe(() => {
      count += 1
    })

    store.select(wallFaceLeft)
    store.clear()
    expect(count).toBe(2)

    unsubscribe()
    store.select(floorOne)
    expect(count).toBe(2)
  })
})
