/**
 * What the probe records for one host frame: everything the page does in one browser frame. The
 * real page runs two callbacks in each browser frame (the 3D library keeps an animation loop of its
 * own beside the render loop of the canvas library) and only one of them submits GPU work, so a
 * sample covers all callbacks of the frame, not one callback.
 */
export interface FrameSample {
  /** The clock at the start of the first callback of the host frame. */
  startMs: number
  /** The clock at the end of the last callback of the host frame minus the start: the main-thread time. */
  mainThreadMs: number
  /**
   * The clock when the GPU queue reported that the frame's submitted work was done (the last
   * submit of the host frame), minus the start; null when no callback of the frame submitted, or
   * when the device was lost.
   */
  untilGpuDoneMs: number | null
  /** True when the done promise of the frame's last submit rejected: the device was lost. */
  gpuLost: boolean
  /** Whether the page was hidden when the first callback of the host frame started. */
  hidden: boolean
}

/** The part of a GPU queue the probe needs, typed structurally so no WebGPU type is required. */
export interface FrameProbeQueuePrototype {
  submit: (...args: never[]) => unknown
  onSubmittedWorkDone: () => Promise<unknown>
}

/** The browser facilities the probe needs, injected so a test can drive them by hand. */
export interface FrameProbeHost {
  /** The original frame request function; the wrapper calls it. */
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  /** The original frame cancel function; the probe calls it for the host request it made. */
  cancelAnimationFrame: (id: number) => void
  /** The clock in milliseconds (performance.now in the page). */
  now: () => number
  /** Whether the page is hidden right now. */
  isHidden: () => boolean
  /** GPUQueue.prototype in the page; undefined when there is no WebGPU. */
  queuePrototype: FrameProbeQueuePrototype | undefined
}

/** The handle of an installed probe. */
export interface FrameProbe {
  /**
   * Turns paced mode on or off. Paced: after a frame that submitted GPU work, every callback of
   * the page is held until that work is done, so each timed frame starts with an idle GPU.
   */
  setPaced(paced: boolean): void
  /**
   * Turns the hold on or off. While held, a host frame runs no callback of the page and records no
   * sample; the callbacks stay queued in request order, and a callback requested during the hold
   * waits too. After `setHeld(false)` they run on the next host frame. The hold combines with paced
   * mode: a callback runs only when neither holds it. `setHeld(false)` without a hold, and a second
   * `setHeld(true)`, change nothing.
   */
  setHeld(held: boolean): void
  /** Returns the complete samples since the last call and clears them. */
  takeFrames(): FrameSample[]
  /**
   * Puts the original request function, cancel function, and queue submit back, by identity, and
   * ends paced mode. Every callback the probe still holds goes to the host's original request
   * function, so it runs on the next host frame whether the GPU work has finished or not.
   *
   * Limit: the released callbacks wait in the host under host ids that the page does not know, so a
   * later cancel by the page with an id of the probe cannot remove them. The timing page calls
   * `uninstall` only at the end of a run, when no view unmounts any more.
   */
  uninstall(): void
}

interface ProbeState {
  paced: boolean
  /** True while the page holds all its callbacks, whatever the GPU is doing. */
  held: boolean
  /** The samples whose done promise is still pending; paced mode holds while this is above zero. */
  pendingGpuWorkCount: number
  /** The host frame whose callbacks are running now, or null between host frames. */
  running: RunningFrame | null
  complete: FrameSample[]
  /** The callbacks the page waits for, by the id the probe gave it; insertion order is id order. */
  waiting: Map<number, FrameRequestCallback>
  nextId: number
  /** The one request the probe has with the host, or null when it has none. */
  hostRequestId: number | null
}

interface RunningFrame {
  sample: FrameSample
  submittedQueueWait: Promise<unknown> | null
}

function finishSample(state: ProbeState, sample: FrameSample, untilGpuDoneMs: number | null): void {
  sample.untilGpuDoneMs = untilGpuDoneMs
  sample.gpuLost = untilGpuDoneMs === null
  state.pendingGpuWorkCount -= 1
  state.complete.push(sample)
}

function watchQueueWait(state: ProbeState, frame: RunningFrame, now: () => number): void {
  const { sample, submittedQueueWait } = frame
  if (submittedQueueWait === null) {
    state.complete.push(sample)
    return
  }
  state.pendingGpuWorkCount += 1
  submittedQueueWait.then(
    () => finishSample(state, sample, now() - sample.startMs),
    () => finishSample(state, sample, null),
  )
}

function startFrame(state: ProbeState, host: FrameProbeHost): RunningFrame {
  const frame: RunningFrame = {
    sample: {
      startMs: host.now(),
      mainThreadMs: 0,
      untilGpuDoneMs: null,
      gpuLost: false,
      hidden: host.isHidden(),
    },
    submittedQueueWait: null,
  }
  state.running = frame
  return frame
}

function endFrame(state: ProbeState, host: FrameProbeHost, frame: RunningFrame): void {
  frame.sample.mainThreadMs = host.now() - frame.sample.startMs
  state.running = null
  watchQueueWait(state, frame, host.now)
}

/**
 * True while the callbacks are held: by the page's own hold, or in paced mode while watched GPU work
 * is pending or this frame submitted.
 */
function isHeld(state: ProbeState): boolean {
  if (state.held) {
    return true
  }
  if (!state.paced) {
    return false
  }
  return state.pendingGpuWorkCount > 0 || state.running?.submittedQueueWait != null
}

function requestHostFrame(state: ProbeState, host: FrameProbeHost): void {
  if (state.hostRequestId !== null || state.waiting.size === 0) {
    return
  }
  state.hostRequestId = host.requestAnimationFrame((frameTime) => {
    runHostFrame(state, host, frameTime)
  })
}

/**
 * Runs the callbacks that waited at the start of the frame, in id order, unless paced mode holds
 * them. Callbacks requested during the frame wait for the next one. The frame is timed as a whole:
 * one clock read before the first callback that runs and one after the last, and no read at all
 * when every callback is held. A callback that throws does not stop the others; the first error is
 * returned so the caller can pass it on to the host.
 */
function runWaitingCallbacks(
  state: ProbeState,
  host: FrameProbeHost,
  frameTime: number,
): { error: unknown } | null {
  let failure: { error: unknown } | null = null
  let frame: RunningFrame | null = null
  for (const id of [...state.waiting.keys()]) {
    if (isHeld(state)) {
      break
    }
    const callback = state.waiting.get(id)
    if (callback === undefined) {
      continue
    }
    state.waiting.delete(id)
    frame ??= startFrame(state, host)
    try {
      callback(frameTime)
    } catch (error) {
      failure ??= { error }
    }
  }
  if (frame !== null) {
    endFrame(state, host, frame)
  }
  return failure
}

function runHostFrame(state: ProbeState, host: FrameProbeHost, frameTime: number): void {
  state.hostRequestId = null
  const failure = runWaitingCallbacks(state, host, frameTime)
  requestHostFrame(state, host)
  if (failure !== null) {
    throw failure.error
  }
}

function createFrameRequester(
  state: ProbeState,
  host: FrameProbeHost,
): (callback: FrameRequestCallback) => number {
  return (callback) => {
    state.nextId += 1
    state.waiting.set(state.nextId, callback)
    requestHostFrame(state, host)
    return state.nextId
  }
}

function createFrameCanceller(state: ProbeState, host: FrameProbeHost): (id: number) => void {
  return (id) => {
    state.waiting.delete(id)
    if (state.waiting.size === 0 && state.hostRequestId !== null) {
      host.cancelAnimationFrame(state.hostRequestId)
      state.hostRequestId = null
    }
  }
}

function releaseWaitingCallbacks(state: ProbeState, host: FrameProbeHost): void {
  if (state.hostRequestId !== null) {
    host.cancelAnimationFrame(state.hostRequestId)
    state.hostRequestId = null
  }
  for (const callback of state.waiting.values()) {
    host.requestAnimationFrame(callback)
  }
  state.waiting.clear()
}

function createSubmitWrapper(
  state: ProbeState,
  original: FrameProbeQueuePrototype['submit'],
): FrameProbeQueuePrototype['submit'] {
  return function submitAndWatch(this: FrameProbeQueuePrototype, ...args: never[]): unknown {
    const result = original.apply(this, args)
    if (state.running !== null) {
      state.running.submittedQueueWait = this.onSubmittedWorkDone()
    }
    return result
  }
}

function createProbeState(): ProbeState {
  return {
    paced: false,
    held: false,
    pendingGpuWorkCount: 0,
    running: null,
    complete: [],
    waiting: new Map(),
    nextId: 0,
    hostRequestId: null,
  }
}

/**
 * Wraps `target.requestAnimationFrame` and `target.cancelAnimationFrame` and the `submit` of the
 * queue prototype of the host, and records one {@link FrameSample} for each host frame in which at
 * least one page callback ran (a host frame without a callback gives no sample). All state lives in
 * the closure of this call. The overhead for each host frame is two clock reads, one visibility
 * read, and a flag, however many callbacks the frame runs; the queue wait of a frame that submitted
 * costs one promise.
 *
 * The probe keeps the page's callbacks in a queue of its own and gives the page ids of its own,
 * unique among the waiting callbacks, so a cancel always finds its callback. It keeps one request
 * with the host at a time. On a host frame it runs the callbacks that were waiting at the start of
 * the frame, in the order in which the page requested them; a callback requested during the frame
 * waits for the next host frame. A cancel removes the callback, and the probe cancels its host
 * request when nothing is left to wait for. A cancel of an unknown id, or of a callback that
 * already ran, does nothing.
 *
 * A sample is complete, and so visible to `takeFrames`, once the frame's done promise has settled
 * (at once for a frame without a submit). A host frame that submits more than once, in one callback or
 * in several, is timed until the done promise of its last submit; a submit outside a host frame is passed through and belongs
 * to no frame. When the done promise rejects, the sample completes with `untilGpuDoneMs: null` and
 * `gpuLost: true`, and the hold ends; every other sample has `gpuLost: false`. A callback that
 * throws is not swallowed: the error propagates to the host as it would without the probe, after
 * the other callbacks of the frame ran, and the frame still gets its one complete sample, timed to
 * the end of the last callback that ran, so the probe works for the next frame.
 *
 * In paced mode, while any GPU work that the probe watches is pending, no callback runs, also one
 * that waits in the same host frame as the callback that submitted. Each frame that submitted
 * counts as one pending piece of work until its done promise settles; the hold ends when the last
 * one has settled, also when it was submitted before paced mode went on. The held callbacks run on
 * the next host frame after that. `uninstall` restores the three originals by identity, ends paced
 * mode, and hands every held callback to the host's original request function, so it runs on the
 * next host frame whether the GPU work has finished or not. After `uninstall`, a sample that was
 * still waiting for its done promise is completed and stays available to `takeFrames`.
 *
 * `setHeld(true)` holds every callback of the page, in paced mode and out of it, until
 * `setHeld(false)`: a host frame under the hold runs nothing and records no sample, and the probe
 * keeps its one host request so frames keep coming. `uninstall` ends the hold.
 */
export function installFrameProbe(
  host: FrameProbeHost,
  target: { requestAnimationFrame: unknown; cancelAnimationFrame: unknown },
): FrameProbe {
  const state = createProbeState()
  const originalRequest = target.requestAnimationFrame
  const originalCancel = target.cancelAnimationFrame
  const originalSubmit = host.queuePrototype?.submit
  target.requestAnimationFrame = createFrameRequester(state, host)
  target.cancelAnimationFrame = createFrameCanceller(state, host)
  if (host.queuePrototype !== undefined && originalSubmit !== undefined) {
    host.queuePrototype.submit = createSubmitWrapper(state, originalSubmit)
  }
  return {
    setPaced: (paced) => {
      state.paced = paced
    },
    setHeld: (held) => {
      state.held = held
    },
    takeFrames: () => state.complete.splice(0),
    uninstall: () => {
      target.requestAnimationFrame = originalRequest
      target.cancelAnimationFrame = originalCancel
      if (host.queuePrototype !== undefined && originalSubmit !== undefined) {
        host.queuePrototype.submit = originalSubmit
      }
      state.paced = false
      state.held = false
      releaseWaitingCallbacks(state, host)
    },
  }
}

/** The first frame that started at or after the time, or undefined when there is none. */
export function firstFrameAfter(
  frames: readonly FrameSample[],
  timeMs: number,
): FrameSample | undefined {
  return frames.find((frame) => frame.startMs >= timeMs)
}
