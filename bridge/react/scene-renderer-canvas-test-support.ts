import { act } from '@testing-library/react'
import { vi } from 'vitest'

export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
}

export function defer<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// act flushes React's effects and state updates; one microtask turn lets a promise reaction run.
export async function settle(resolve: () => void): Promise<void> {
  await act(async () => {
    resolve()
    await Promise.resolve()
  })
}

/** A stand-in renderer whose init() settles when the test says so and that notes when it ran. */
export interface FakeRenderer {
  init: ReturnType<typeof vi.fn>
  running: boolean
}

export function buildFakeRenderer(started: Deferred<void>): FakeRenderer {
  const renderer: FakeRenderer = {
    running: false,
    init: vi.fn(() =>
      started.promise.then(() => {
        renderer.running = true
      }),
    ),
  }
  return renderer
}
