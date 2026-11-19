import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebLocksProjectLockPort } from './project-lock'

const NEXT_MACROTASK_DELAY_MS = 0

/**
 * A small model of the browser lock manager. Every port built while it is
 * installed behaves like one more tab of the same browser. A lock frees one
 * task after the promise of its callback settles, as in some browser engines.
 */
class FakeLockManager {
  private readonly heldNames = new Set<string>()

  async request(
    name: string,
    _options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ): Promise<unknown> {
    if (this.heldNames.has(name)) {
      return callback(null)
    }
    this.heldNames.add(name)
    const lock: Lock = { name, mode: 'exclusive' }
    try {
      return await callback(lock)
    } finally {
      await new Promise((resolve) => setTimeout(resolve, NEXT_MACROTASK_DELAY_MS))
      this.heldNames.delete(name)
    }
  }

  query(): Promise<LockManagerSnapshot> {
    const held = [...this.heldNames].map((name) => ({
      name,
      mode: 'exclusive' as const,
      clientId: 'test',
    }))
    return Promise.resolve({ held, pending: [] })
  }

  /** Holds a lock directly, as any other part of the page could. */
  holdDirectly(name: string): void {
    void this.request(name, { ifAvailable: true }, () => new Promise<void>(() => undefined))
  }
}

describe('WebLocksProjectLockPort over a browser lock manager', () => {
  let manager: FakeLockManager

  beforeEach(() => {
    manager = new FakeLockManager()
    vi.stubGlobal('navigator', { locks: manager })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function twoTabs(): [WebLocksProjectLockPort, WebLocksProjectLockPort] {
    return [new WebLocksProjectLockPort(), new WebLocksProjectLockPort()]
  }

  it('reports support and gives a hold to the first tryAcquire of a project id', async () => {
    const [port] = twoTabs()

    expect(port.supported).toBe(true)
    await expect(port.tryAcquire('a')).resolves.toBeDefined()
  })

  it('gives undefined to a second port that tries a held project id', async () => {
    const [firstTab, secondTab] = twoTabs()
    await firstTab.tryAcquire('a')

    await expect(secondTab.tryAcquire('a')).resolves.toBeUndefined()
  })

  it('lists held project ids and leaves out a held lock with another name', async () => {
    const [firstTab, secondTab] = twoTabs()
    await firstTab.tryAcquire('a')
    await secondTab.tryAcquire('b')
    manager.holdDirectly('some-other-lock')

    expect(await firstTab.heldIds()).toEqual(new Set(['a', 'b']))
  })

  it('frees the lock by the time the release resolves', async () => {
    const [firstTab, secondTab] = twoTabs()
    const hold = await firstTab.tryAcquire('a')

    await hold?.release()

    await expect(secondTab.tryAcquire('a')).resolves.toBeDefined()
  })

  it('frees the lock by the time a second release of the same hold resolves', async () => {
    const [firstTab, secondTab] = twoTabs()
    const hold = await firstTab.tryAcquire('a')

    const first = hold?.release()
    const second = hold?.release()
    await second

    await expect(secondTab.tryAcquire('a')).resolves.toBeDefined()
    await first
  })

  it('leaves a newer hold of the same port in place when the old hold releases again', async () => {
    const [port, otherTab] = twoTabs()
    const oldHold = await port.tryAcquire('a')
    await oldHold?.release()
    await port.tryAcquire('a')

    await oldHold?.release()

    await expect(otherTab.tryAcquire('a')).resolves.toBeUndefined()
    expect(await port.heldIds()).toContain('a')
  })

  it('keeps the release of a holder complete after a failed attempt of the same port', async () => {
    const [port, otherTab] = twoTabs()
    const hold = await port.tryAcquire('a')
    await expect(port.tryAcquire('a')).resolves.toBeUndefined()

    await hold?.release()

    await expect(otherTab.tryAcquire('a')).resolves.toBeDefined()
  })
})
