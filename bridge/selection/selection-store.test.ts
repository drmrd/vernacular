import { describe, it, expect } from 'vitest'
import { createSelectionStore } from './selection-store'

describe('createSelectionStore', () => {
  it('selects a single id, replacing any prior selection', () => {
    const store = createSelectionStore()

    store.select('wall:a')
    expect([...store.getSelectedIds()]).toEqual(['wall:a'])
    store.select('wall:b')
    expect([...store.getSelectedIds()]).toEqual(['wall:b'])
  })

  it('clears the selection', () => {
    const store = createSelectionStore()
    store.select('wall:a')

    store.clear()
    expect(store.getSelectedIds().size).toBe(0)
  })

  it('reports whether a given id is selected', () => {
    const store = createSelectionStore()
    store.select('wall:a')

    expect(store.isSelected('wall:a')).toBe(true)
    expect(store.isSelected('wall:b')).toBe(false)
  })

  it('returns a stable reference until the selection changes', () => {
    const store = createSelectionStore()
    const empty = store.getSelectedIds()

    expect(store.getSelectedIds()).toBe(empty)
    store.select('wall:a')
    expect(store.getSelectedIds()).not.toBe(empty)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const store = createSelectionStore()
    let count = 0
    const unsubscribe = store.subscribe(() => {
      count += 1
    })

    store.select('wall:a')
    store.clear()
    expect(count).toBe(2)

    unsubscribe()
    store.select('wall:b')
    expect(count).toBe(2)
  })

  it('returns the same empty reference across repeated clears', () => {
    const store = createSelectionStore()
    store.select('wall:a')

    store.clear()
    const firstEmpty = store.getSelectedIds()
    store.clear()

    expect(store.getSelectedIds()).toBe(firstEmpty)
    expect(firstEmpty.size).toBe(0)
  })

  it('toggles an id into and out of the selection while preserving the rest', () => {
    const store = createSelectionStore()

    store.toggle('wall:a')
    expect([...store.getSelectedIds()]).toEqual(['wall:a'])

    store.toggle('wall:b')
    expect(new Set(store.getSelectedIds())).toEqual(new Set(['wall:a', 'wall:b']))

    store.toggle('wall:a')
    expect([...store.getSelectedIds()]).toEqual(['wall:b'])
  })

  it('notifies subscribers when a toggle changes the selection', () => {
    const store = createSelectionStore()
    let count = 0
    store.subscribe(() => {
      count += 1
    })

    store.toggle('wall:a')
    store.toggle('wall:a')
    expect(count).toBe(2)
  })

  it('replaces the whole selection with the given ids', () => {
    const store = createSelectionStore()
    store.select('wall:z')

    store.setSelection(['wall:a', 'wall:b'])
    expect(new Set(store.getSelectedIds())).toEqual(new Set(['wall:a', 'wall:b']))

    store.setSelection([])
    expect(store.getSelectedIds().size).toBe(0)
  })

  it('notifies subscribers when setSelection changes the selection', () => {
    const store = createSelectionStore()
    let count = 0
    store.subscribe(() => {
      count += 1
    })

    store.setSelection(['wall:a', 'wall:b'])
    expect(count).toBe(1)
  })
})
