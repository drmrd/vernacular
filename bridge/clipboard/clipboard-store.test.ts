import { describe, it, expect } from 'vitest'
import type { ClipboardSnapshot } from '../../core'
import { createClipboardStore } from './clipboard-store'

const emptySnapshot = (): ClipboardSnapshot => ({
  walls: [],
  openings: [],
  dimensions: [],
})

describe('createClipboardStore', () => {
  it('reads undefined before anything is written', () => {
    const store = createClipboardStore()

    expect(store.read()).toBeUndefined()
  })

  it('reads back the snapshot that was written', () => {
    const store = createClipboardStore()
    const snapshot = emptySnapshot()

    store.write(snapshot)

    expect(store.read()).toBe(snapshot)
  })

  it('replaces the stored snapshot on a subsequent write', () => {
    const store = createClipboardStore()
    const first = emptySnapshot()
    const second = emptySnapshot()

    store.write(first)
    store.write(second)

    expect(store.read()).toBe(second)
  })
})
