import { describe, it, expect, vi } from 'vitest'
import { colorFromHex, type SurfaceRef } from '../../core'
import { createPerceivedColorStore } from './perceived-color-store'

const wallFaceLeft: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
const floorGround: SurfaceRef = { kind: 'floor', floorId: 'ground' }
const ndcOrigin = { x: 0, y: 0 }
const ndcOffset = { x: 0.25, y: -0.5 }

describe('createPerceivedColorStore', () => {
  it('starts with no pending request and no sample', () => {
    const store = createPerceivedColorStore()

    expect(store.getRequest()).toBeNull()
    expect(store.getSample()).toBeNull()
  })

  it('records the surface and NDC coordinates of a requested sample', () => {
    const store = createPerceivedColorStore()

    store.requestSample(wallFaceLeft, ndcOrigin)

    expect(store.getRequest()).toEqual({ surface: wallFaceLeft, ndc: ndcOrigin })
  })

  it('clears a stale sample when a new request comes in, so a leftover readout never appears to describe the newly picked surface', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    store.resolveSample({ surface: wallFaceLeft, color: colorFromHex('#a1b2c3') })
    expect(store.getSample()).not.toBeNull()

    store.requestSample(floorGround, ndcOffset)

    expect(store.getSample()).toBeNull()
  })

  it('resolves a sample and clears the pending request, since the request is one-shot', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    const sample = { surface: wallFaceLeft, color: colorFromHex('#a1b2c3') }

    store.resolveSample(sample)

    expect(store.getSample()).toEqual(sample)
    expect(store.getRequest()).toBeNull()
  })

  it('drops both the pending request and the resolved sample on clear', () => {
    const store = createPerceivedColorStore()
    store.requestSample(wallFaceLeft, ndcOrigin)
    store.resolveSample({ surface: wallFaceLeft, color: colorFromHex('#a1b2c3') })

    store.clear()

    expect(store.getRequest()).toBeNull()
    expect(store.getSample()).toBeNull()
  })

  it('notifies subscribers on requestSample, resolveSample, and clear', () => {
    const store = createPerceivedColorStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.requestSample(wallFaceLeft, ndcOrigin)
    expect(listener).toHaveBeenCalledTimes(1)

    store.resolveSample({ surface: wallFaceLeft, color: colorFromHex('#a1b2c3') })
    expect(listener).toHaveBeenCalledTimes(2)

    store.clear()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const store = createPerceivedColorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.requestSample(wallFaceLeft, ndcOrigin)

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies every subscribed listener', () => {
    const store = createPerceivedColorStore()
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)

    store.requestSample(wallFaceLeft, ndcOrigin)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
