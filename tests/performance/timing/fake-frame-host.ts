import type { FrameProbeHost } from './frame-probe'

export type FrameRequest = (callback: FrameRequestCallback) => number

interface FakeQueue {
  submit: (commands: string[]) => string
}

export const SUBMIT_RESULT = 'submitted'
const SETTLE_ROUNDS = 8

/** The frame queue of a page: frames run only when `runFrame` says so. */
function createFrameQueue() {
  let nextId = 1
  let waiting: { id: number; callback: FrameRequestCallback }[] = []
  const request: FrameRequest = (callback) => {
    const id = nextId
    nextId += 1
    waiting.push({ id, callback })
    return id
  }
  /** Runs the callbacks that wait now; those they request wait for the next frame. */
  const runFrame = (frameTimeMs = 0) => {
    const running = waiting
    waiting = []
    for (const entry of running) entry.callback(frameTimeMs)
  }
  return { request, runFrame, waitingFrameCount: () => waiting.length }
}

/** A queue prototype whose done promises resolve only when `finishGpuWork` says so. */
function createQueuePrototype() {
  const doneResolvers: (() => void)[] = []
  const submitCalls: { receiver: unknown; args: unknown[] }[] = []
  const originalSubmit = function (this: unknown, ...args: unknown[]): string {
    submitCalls.push({ receiver: this, args })
    return SUBMIT_RESULT
  }
  const prototype = {
    submit: originalSubmit,
    onSubmittedWorkDone: (): Promise<void> =>
      new Promise<void>((resolve) => {
        doneResolvers.push(resolve)
      }),
  }
  const queue = Object.create(prototype) as FakeQueue
  /** Resolves the done promise that was asked for first and is still open. */
  const finishGpuWork = () => doneResolvers.shift()?.()
  return { prototype, queue, originalSubmit, submitCalls, finishGpuWork }
}

/**
 * A page that the test drives by hand: frames run only when `runFrame` says so, the clock moves
 * only when `advance` says so, and the GPU work of the fake queue is done only when `finishGpuWork`
 * says so.
 */
export function createFakeFrameHost(startClockMs = 0) {
  let clockMs = startClockMs
  let hidden = false
  const frames = createFrameQueue()
  const gpu = createQueuePrototype()

  const host: FrameProbeHost = {
    requestAnimationFrame: frames.request,
    now: () => clockMs,
    isHidden: () => hidden,
    queuePrototype: gpu.prototype,
  }
  const target: { requestAnimationFrame: FrameRequest } = {
    requestAnimationFrame: frames.request,
  }

  return {
    host,
    target,
    queue: gpu.queue,
    queuePrototype: gpu.prototype,
    originalRequestFrame: frames.request,
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
    finishGpuWork: gpu.finishGpuWork,
  }
}

/** Lets promise reactions (a few chained ones) run, with microtasks only. */
export async function settle(rounds = SETTLE_ROUNDS): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve()
}
