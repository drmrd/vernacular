import type { FrameProbeHost } from './frame-probe'

export type FrameRequest = (callback: FrameRequestCallback) => number
export type FrameCancel = (id: number) => void

interface FakeQueue {
  submit: (commands: string[]) => string
}

export const SUBMIT_RESULT = 'submitted'
const SETTLE_ROUNDS = 8

/** Runs a frame callback like a browser: an error is collected, not allowed to stop the frame. */
function runAndCollect(callback: FrameRequestCallback, frameTimeMs: number, errors: unknown[]) {
  try {
    callback(frameTimeMs)
  } catch (error) {
    errors.push(error)
  }
}

/** The frame queue of a page: frames run only when `runFrame` says so. */
function createFrameQueue() {
  let nextId = 1
  let waiting: { id: number; callback: FrameRequestCallback; cancelled: boolean }[] = []
  let running: typeof waiting = []
  const request: FrameRequest = (callback) => {
    const id = nextId
    nextId += 1
    waiting.push({ id, callback, cancelled: false })
    return id
  }
  /** Removes the waiting callback with that host id, also from a frame that is running now. */
  const cancel: FrameCancel = (id) => {
    for (const entry of waiting) if (entry.id === id) entry.cancelled = true
    waiting = waiting.filter((entry) => entry.id !== id)
    for (const entry of running) if (entry.id === id) entry.cancelled = true
  }
  /**
   * Runs the callbacks that wait now; those they request wait for the next frame. A callback that
   * throws does not stop the others, as in a browser; the first error is rethrown after the frame.
   * `betweenCallbacks` runs after one host callback and before the next one of the same frame:
   * time that the page spends between its callbacks, which a test can use to move the clock.
   */
  const runFrame = (frameTimeMs = 0, betweenCallbacks?: () => void) => {
    running = waiting
    waiting = []
    const errors: unknown[] = []
    let ranAny = false
    for (const entry of running) {
      if (entry.cancelled) continue
      if (ranAny) betweenCallbacks?.()
      ranAny = true
      runAndCollect(entry.callback, frameTimeMs, errors)
    }
    running = []
    if (errors.length > 0) throw errors[0]
  }
  return {
    request,
    cancel,
    runFrame,
    waitingFrameCount: () => waiting.length,
    waitingFrameIds: () => waiting.map((entry) => entry.id),
  }
}

/** A queue prototype whose done promises resolve only when `finishGpuWork` says so. */
function createQueuePrototype() {
  const doneControls: { resolve: () => void; reject: (reason: unknown) => void }[] = []
  const submitCalls: { receiver: unknown; args: unknown[] }[] = []
  const originalSubmit = function (this: unknown, ...args: unknown[]): string {
    submitCalls.push({ receiver: this, args })
    return SUBMIT_RESULT
  }
  const prototype = {
    submit: originalSubmit,
    onSubmittedWorkDone: (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        doneControls.push({ resolve, reject })
      }),
  }
  const queue = Object.create(prototype) as FakeQueue
  /** Resolves the done promise that was asked for first and is still open. */
  const finishGpuWork = () => doneControls.shift()?.resolve()
  /** Rejects the done promise that was asked for first and is still open: a lost device. */
  const failGpuWork = () => doneControls.shift()?.reject(new Error('device lost'))
  return { prototype, queue, originalSubmit, submitCalls, finishGpuWork, failGpuWork }
}

/**
 * A page that the test drives by hand: frames run only when `runFrame` says so, the clock moves
 * only when `advance` says so, and the GPU work of the fake queue is done only when `finishGpuWork`
 * says so. A GPU work that is not finished can also be failed with `failGpuWork`.
 */
export function createFakeFrameHost(startClockMs = 0) {
  let clockMs = startClockMs
  let hidden = false
  const frames = createFrameQueue()
  const gpu = createQueuePrototype()

  const host: FrameProbeHost = {
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
    now: () => clockMs,
    isHidden: () => hidden,
    queuePrototype: gpu.prototype,
  }
  const target: { requestAnimationFrame: FrameRequest; cancelAnimationFrame: FrameCancel } = {
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
  }

  return {
    host,
    target,
    queue: gpu.queue,
    queuePrototype: gpu.prototype,
    originalRequestFrame: frames.request,
    originalCancelFrame: frames.cancel,
    originalSubmit: gpu.originalSubmit,
    submitCalls: gpu.submitCalls,
    advance: (ms: number) => {
      clockMs += ms
    },
    setHidden: (value: boolean) => {
      hidden = value
    },
    runFrame: frames.runFrame,
    waitingFrameCount: frames.waitingFrameCount,
    waitingFrameIds: frames.waitingFrameIds,
    finishGpuWork: gpu.finishGpuWork,
    failGpuWork: gpu.failGpuWork,
  }
}

/** Lets promise reactions (a few chained ones) run, with microtasks only. */
export async function settle(rounds = SETTLE_ROUNDS): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve()
}
