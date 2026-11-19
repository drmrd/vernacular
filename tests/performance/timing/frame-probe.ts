/** What the probe records for one frame callback of the page. */
export interface FrameSample {
  /** The clock at the start of the callback. */
  startMs: number
  /** The clock at the end of the callback minus the start: the main-thread time of the frame. */
  mainThreadMs: number
  /**
   * The clock when the GPU queue reported that the frame's submitted work was done, minus the
   * start; null when the callback made no queue submit (or the done promise rejected).
   */
  untilGpuDoneMs: number | null
  /** Whether the page was hidden when the callback ran. */
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
   * Turns paced mode on or off. Paced: after a frame that submitted GPU work, the page's next
   * callback is held until that work is done, so each timed frame starts with an idle GPU.
   */
  setPaced(paced: boolean): void
  /** Returns the complete samples since the last call and clears them. */
  takeFrames(): FrameSample[]
  /** Puts the original request function and queue submit back, by identity. */
  uninstall(): void
}

interface ProbeState {
  paced: boolean
  /** True from a submit until its done promise settles. */
  gpuPending: boolean
  /** The frame whose callback is running now, or null between callbacks. */
  running: RunningFrame | null
  complete: FrameSample[]
}

interface RunningFrame {
  sample: FrameSample
  submittedQueueWait: Promise<unknown> | null
}

function finishSample(state: ProbeState, sample: FrameSample, untilGpuDoneMs: number | null): void {
  sample.untilGpuDoneMs = untilGpuDoneMs
  state.gpuPending = false
  state.complete.push(sample)
}

function watchQueueWait(state: ProbeState, frame: RunningFrame, now: () => number): void {
  const { sample, submittedQueueWait } = frame
  if (submittedQueueWait === null) {
    state.complete.push(sample)
    return
  }
  state.gpuPending = true
  submittedQueueWait.then(
    () => finishSample(state, sample, now() - sample.startMs),
    () => finishSample(state, sample, null),
  )
}

function timeFrame(
  state: ProbeState,
  host: FrameProbeHost,
  callback: FrameRequestCallback,
): FrameRequestCallback {
  return (frameTime) => {
    const startMs = host.now()
    const frame: RunningFrame = {
      sample: {
        startMs,
        mainThreadMs: 0,
        untilGpuDoneMs: null,
        hidden: host.isHidden(),
      },
      submittedQueueWait: null,
    }
    state.running = frame
    try {
      callback(frameTime)
    } finally {
      frame.sample.mainThreadMs = host.now() - startMs
      state.running = null
      watchQueueWait(state, frame, host.now)
    }
  }
}

function createFrameRequester(
  state: ProbeState,
  host: FrameProbeHost,
): (callback: FrameRequestCallback) => number {
  const request = (callback: FrameRequestCallback): number => {
    const timed = timeFrame(state, host, callback)
    return host.requestAnimationFrame((frameTime) => {
      if (state.paced && state.gpuPending) {
        request(callback)
        return
      }
      timed(frameTime)
    })
  }
  return request
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

/**
 * Wraps the frame callbacks the page requests through `target.requestAnimationFrame` and the
 * `submit` of the queue prototype of the host, and records one {@link FrameSample} per callback.
 * All state lives in the closure of this call. The overhead inside a frame is two clock reads, one
 * visibility read, and a flag; the queue wait of a frame that submitted costs one promise.
 *
 * A sample is complete, and so visible to `takeFrames`, once the frame's done promise has settled
 * (at once for a frame without a submit). A frame that submits more than once is timed until the
 * done promise of its last submit. A callback that throws is not swallowed: the error propagates
 * to the host as it would without the probe, and the `finally` still closes the frame's
 * bookkeeping, so the probe works for the next frame. After `uninstall`, a sample that was still
 * waiting for its done promise is completed and stays available to `takeFrames`.
 *
 * In paced mode a held callback is requested again on each host frame until the GPU work is done,
 * so it runs on the first host frame after that. The id the page got for its request then no
 * longer cancels the callback.
 */
export function installFrameProbe(
  host: FrameProbeHost,
  target: { requestAnimationFrame: unknown },
): FrameProbe {
  const state: ProbeState = {
    paced: false,
    gpuPending: false,
    running: null,
    complete: [],
  }
  const originalRequest = target.requestAnimationFrame
  const originalSubmit = host.queuePrototype?.submit
  target.requestAnimationFrame = createFrameRequester(state, host)
  if (host.queuePrototype !== undefined && originalSubmit !== undefined) {
    host.queuePrototype.submit = createSubmitWrapper(state, originalSubmit)
  }
  return {
    setPaced: (paced) => {
      state.paced = paced
    },
    takeFrames: () => state.complete.splice(0),
    uninstall: () => {
      target.requestAnimationFrame = originalRequest
      if (host.queuePrototype !== undefined && originalSubmit !== undefined) {
        host.queuePrototype.submit = originalSubmit
      }
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
