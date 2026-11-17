import { describe, expect, it, vi } from 'vitest'

import { releaseSceneRenderer } from './release-renderer'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
}

function defer<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// Vitest fails the whole run on an unhandled rejection but names no test. This listener records
// the rejections that Node reports while one case runs, so the case that caused one fails itself.
// Node reports a rejection after the microtask queue drains, hence the timer turn before reading.
function recordUnhandledRejections(): { read: () => Promise<unknown[]>; stop: () => void } {
  const seen: unknown[] = []
  const listener = (reason: unknown): void => {
    seen.push(reason)
  }
  process.on('unhandledRejection', listener)
  return {
    read: async () => {
      await new Promise((turn) => setTimeout(turn, 0))
      return seen
    },
    stop: () => process.off('unhandledRejection', listener),
  }
}

describe('releaseSceneRenderer', () => {
  it('disposes a renderer once, after its start has resolved', async () => {
    const renderer = { dispose: vi.fn() }

    await releaseSceneRenderer(renderer, Promise.resolve())

    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('holds back dispose while the start is pending and runs it once the start resolves', async () => {
    const renderer = { dispose: vi.fn() }
    const start = defer<void>()

    const released = releaseSceneRenderer(renderer, start.promise)
    await new Promise((turn) => setTimeout(turn, 0))

    expect(renderer.dispose).not.toHaveBeenCalled()

    start.resolve()
    await released

    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })

  it('resolves without disposing or raising a rejection when the start fails', async () => {
    const renderer = { dispose: vi.fn() }
    const rejections = recordUnhandledRejections()

    try {
      await expect(
        releaseSceneRenderer(renderer, Promise.reject(new Error('no GPU adapter'))),
      ).resolves.toBeUndefined()

      expect(renderer.dispose).not.toHaveBeenCalled()
      expect(await rejections.read()).toEqual([])
    } finally {
      rejections.stop()
    }
  })
})
