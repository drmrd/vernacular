import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryProjectLockPort,
  WebLocksProjectLockPort,
  type ProjectLockPort,
} from './project-lock'

function twoTabsOnOneRegistry(): [ProjectLockPort, ProjectLockPort] {
  const registry = new Set<string>()
  return [new InMemoryProjectLockPort(registry), new InMemoryProjectLockPort(registry)]
}

describe('InMemoryProjectLockPort on one shared registry', () => {
  it('gives a hold to the first tryAcquire of a project id', async () => {
    const [firstTab] = twoTabsOnOneRegistry()

    await expect(firstTab.tryAcquire('a')).resolves.toBeDefined()
  })

  it('gives undefined to a second port that tries a held project id', async () => {
    const [firstTab, secondTab] = twoTabsOnOneRegistry()
    await firstTab.tryAcquire('a')

    await expect(secondTab.tryAcquire('a')).resolves.toBeUndefined()
  })

  it('lists a held project id in heldIds of both ports', async () => {
    const [firstTab, secondTab] = twoTabsOnOneRegistry()
    await firstTab.tryAcquire('a')

    expect(await firstTab.heldIds()).toContain('a')
    expect(await secondTab.heldIds()).toContain('a')
  })

  it('frees a project id on release so that the second port acquires it', async () => {
    const [firstTab, secondTab] = twoTabsOnOneRegistry()
    const hold = await firstTab.tryAcquire('a')

    await hold?.release()

    expect(await secondTab.heldIds()).not.toContain('a')
    await expect(secondTab.tryAcquire('a')).resolves.toBeDefined()
  })

  it('does not contend across distinct project ids', async () => {
    const [firstTab, secondTab] = twoTabsOnOneRegistry()

    const firstHold = await firstTab.tryAcquire('a')
    const secondHold = await secondTab.tryAcquire('b')

    expect(firstHold).toBeDefined()
    expect(secondHold).toBeDefined()
    expect(await firstTab.heldIds()).toEqual(new Set(['a', 'b']))
  })

  it('does not contend between ports built without a shared registry', async () => {
    const firstTab = new InMemoryProjectLockPort()
    const secondTab = new InMemoryProjectLockPort()
    await firstTab.tryAcquire('a')

    await expect(secondTab.tryAcquire('a')).resolves.toBeDefined()
  })
})

describe('WebLocksProjectLockPort without navigator.locks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function portWithoutWebLocks(): ProjectLockPort {
    vi.stubGlobal('navigator', {})
    return new WebLocksProjectLockPort()
  }

  it('reports that locking is unsupported', () => {
    expect(portWithoutWebLocks().supported).toBe(false)
  })

  it('gives a hold to every tryAcquire call and resolves each release', async () => {
    const port = portWithoutWebLocks()

    const firstHold = await port.tryAcquire('a')
    const secondHold = await port.tryAcquire('a')

    expect(firstHold).toBeDefined()
    expect(secondHold).toBeDefined()
    await expect(firstHold?.release()).resolves.toBeUndefined()
    await expect(secondHold?.release()).resolves.toBeUndefined()
  })

  it('lists no held ids, also while a hold is out', async () => {
    const port = portWithoutWebLocks()
    await port.tryAcquire('a')

    expect((await port.heldIds()).size).toBe(0)
  })
})
