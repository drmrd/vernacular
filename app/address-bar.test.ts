import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserAddressBar, createMemoryAddressBar } from './address-bar'

const PROJECTS = '#/projects'
const KITCHEN = '#/project/kitchen'
const CELLAR = '#/project/cellar'
const ATTIC = '#/project/attic'

describe('the address bar in memory', () => {
  it('starts with one entry that holds the first address', () => {
    const bar = createMemoryAddressBar(PROJECTS)

    expect(bar.entries()).toStrictEqual([PROJECTS])
    expect(bar.position()).toBe(0)
    expect(bar.hash()).toBe(PROJECTS)
    expect(createMemoryAddressBar().entries()).toStrictEqual([''])
  })

  it('replaces the present entry and adds none', () => {
    const bar = createMemoryAddressBar(PROJECTS)

    bar.replace(KITCHEN)

    expect(bar.entries()).toStrictEqual([KITCHEN])
    expect(bar.position()).toBe(0)
    expect(bar.hash()).toBe(KITCHEN)
  })

  it('adds an entry at a push and drops the entries ahead of it', () => {
    const bar = createMemoryAddressBar(PROJECTS)
    bar.push(KITCHEN)
    bar.push(CELLAR)
    bar.back()
    bar.back()

    bar.push(ATTIC)

    expect(bar.entries()).toStrictEqual([PROJECTS, ATTIC])
    expect(bar.position()).toBe(1)
    expect(bar.hash()).toBe(ATTIC)
  })

  it('moves back and forward by one entry and tells its listeners', () => {
    const bar = createMemoryAddressBar(PROJECTS)
    bar.push(KITCHEN)
    bar.push(CELLAR)
    const listener = vi.fn()
    bar.onNavigate(listener)

    bar.back()

    expect(bar.hash()).toBe(KITCHEN)
    expect(listener).toHaveBeenCalledTimes(1)

    bar.forward()

    expect(bar.hash()).toBe(CELLAR)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(bar.entries()).toStrictEqual([PROJECTS, KITCHEN, CELLAR])
  })

  it('does nothing at the first entry and at the last', () => {
    const bar = createMemoryAddressBar(PROJECTS)
    bar.push(KITCHEN)
    const listener = vi.fn()
    bar.onNavigate(listener)

    bar.forward()

    expect(bar.position()).toBe(1)
    bar.back()
    listener.mockClear()
    bar.back()

    expect(bar.position()).toBe(0)
    expect(bar.hash()).toBe(PROJECTS)
    expect(listener).not.toHaveBeenCalled()
  })

  it('tells its listeners of a visit, and of no replace and no push', () => {
    const bar = createMemoryAddressBar(PROJECTS)
    const listener = vi.fn()
    bar.onNavigate(listener)

    bar.replace(KITCHEN)
    bar.push(CELLAR)

    expect(listener).not.toHaveBeenCalled()

    bar.visit(ATTIC)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(bar.hash()).toBe(ATTIC)
    expect(bar.entries()).toStrictEqual([KITCHEN, CELLAR, ATTIC])
  })

  it('stops telling a listener that was removed', () => {
    const bar = createMemoryAddressBar(PROJECTS)
    const listener = vi.fn()
    const remove = bar.onNavigate(listener)

    remove()
    bar.visit(KITCHEN)
    bar.back()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('the address bar of the window', () => {
  const PLAN_PATH = '/plan'
  let startAddress: string
  let startState: unknown

  const where = (): string =>
    window.location.pathname + window.location.search + window.location.hash

  beforeEach(() => {
    startAddress = where()
    startState = window.history.state
  })

  afterEach(() => {
    window.history.replaceState(startState, '', startAddress)
  })

  it('reads the fragment of the window', () => {
    window.history.replaceState(null, '', PROJECTS)

    expect(createBrowserAddressBar(window).hash()).toBe(PROJECTS)
  })

  it('keeps the path and the query when it replaces the fragment', () => {
    window.history.replaceState(null, '', `${PLAN_PATH}?fixture=scene-harness${PROJECTS}`)

    createBrowserAddressBar(window).replace(KITCHEN)

    expect(where()).toBe(`${PLAN_PATH}?fixture=scene-harness${KITCHEN}`)
  })

  it('keeps the path and the query when it pushes a fragment', () => {
    window.history.replaceState(null, '', `${PLAN_PATH}?e2e-storage`)

    createBrowserAddressBar(window).push(CELLAR)

    expect(where()).toBe(`${PLAN_PATH}?e2e-storage${CELLAR}`)
  })

  it('removes the fragment and keeps the path and the query for the start address', () => {
    window.history.replaceState(null, '', `${PLAN_PATH}?fixture=scene-harness${KITCHEN}`)

    createBrowserAddressBar(window).replace('')

    expect(where()).toBe(`${PLAN_PATH}?fixture=scene-harness`)
    expect(createBrowserAddressBar(window).hash()).toBe('')
  })

  it('adds no entry at a replace and one entry at a push', () => {
    const bar = createBrowserAddressBar(window)
    const before = window.history.length

    bar.replace(KITCHEN)

    expect(window.history.length).toBe(before)

    bar.push(CELLAR)

    expect(window.history.length).toBe(before + 1)
  })

  it('keeps the state of the history entry at a replace', () => {
    const state = { marker: 'kept' }
    window.history.replaceState(state, '', PROJECTS)

    createBrowserAddressBar(window).replace(KITCHEN)

    expect(window.history.state).toStrictEqual(state)
  })

  it('tells its listeners when the window reports a move through the history', () => {
    const listener = vi.fn()
    const remove = createBrowserAddressBar(window).onNavigate(listener)

    window.dispatchEvent(new PopStateEvent('popstate'))
    remove()

    expect(listener).toHaveBeenCalled()
  })

  it('tells its listeners when the window reports a changed fragment', () => {
    const listener = vi.fn()
    const remove = createBrowserAddressBar(window).onNavigate(listener)

    window.dispatchEvent(new HashChangeEvent('hashchange'))
    remove()

    expect(listener).toHaveBeenCalled()
  })

  it('listens to nothing after the listener was removed', () => {
    const listener = vi.fn()
    const remove = createBrowserAddressBar(window).onNavigate(listener)

    remove()
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(listener).not.toHaveBeenCalled()
  })
})
