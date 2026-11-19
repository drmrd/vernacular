import { firstFrameAfter, type FrameProbe, type FrameSample } from '../frame-probe'
import { MILLISECONDS_PER_SECOND, NO_FRAME_LIMIT_MS, frameWithinLimit } from './page-waits'

/**
 * The longest wait for one finished frame sample. In paced mode the probe rightly holds the page's
 * callbacks while the GPU works on the frame before, so the samples can pause much longer than the
 * host frames do; a frame whose GPU work takes this long is a fault of the GPU or its driver, not a
 * slow frame.
 */
export const SAMPLE_LIMIT_MS = 10_000

/**
 * The samples dropped right after the switch to paced mode. At the switch one host frame can run
 * the render callback alone, while the other callback of that frame waits for the next one, so the
 * first sample, and the one after it, may each hold only part of a frame.
 */
export const PACED_SWITCH_DISCARD_FRAMES = 2

/** What a wait for frame samples watches: the probe, the host frames, the live view, its name. */
export interface FrameWatch {
  readonly probe: FrameProbe
  /** The browser's own frame request, unwrapped: the page's waits poll on it. */
  readonly hostFrame: () => Promise<number>
  /** Throws when the live view reported a failure. */
  readonly checkHealth: () => void
  /** What is being drawn, for the messages: a render variant or an edit. */
  readonly what: string
}

function sampleLimitError(what: string): Error {
  return new Error(
    `The GPU did not finish a frame of "${what}" within ${SAMPLE_LIMIT_MS / MILLISECONDS_PER_SECOND} s, ` +
      'so nothing was measured. Run again; if it repeats, update the graphics driver or the browser.',
  )
}

/**
 * Waits for the next host frame, which must come within the limit ({@link NO_FRAME_LIMIT_MS} by
 * default; a hidden or minimized window stops host frames), then checks the live view.
 */
export async function nextHostPoll(
  watch: FrameWatch,
  limitMs: number = NO_FRAME_LIMIT_MS,
): Promise<void> {
  await frameWithinLimit(watch.hostFrame, watch.what, limitMs)
  watch.checkHealth()
}

/**
 * The next `count` finished frame samples that started at or after `startedAtMs`, one sample for
 * each host frame. The page looks for them once a host frame. Throws when the live view fails,
 * when the host frames stop, or when no sample finishes within {@link SAMPLE_LIMIT_MS}.
 */
export async function collectFrames(
  watch: FrameWatch,
  count: number,
  startedAtMs: number,
): Promise<FrameSample[]> {
  const frames: FrameSample[] = []
  let lastArrivalMs = performance.now()
  while (frames.length < count) {
    await nextHostPoll(watch)
    const fresh = watch.probe.takeFrames().filter((frame) => frame.startMs >= startedAtMs)
    if (fresh.length > 0) {
      frames.push(...fresh)
      lastArrivalMs = performance.now()
    } else if (performance.now() - lastArrivalMs > SAMPLE_LIMIT_MS) {
      throw sampleLimitError(watch.what)
    }
  }
  return frames.slice(0, count)
}

/**
 * The first finished frame sample that started at or after the time: the first host frame whose
 * callbacks ran after it, which holds the render of anything React committed before it. The samples
 * before it, and the ones after it that finished by the same poll, are dropped. Throws as
 * {@link collectFrames}.
 */
export async function frameStartingAfter(watch: FrameWatch, timeMs: number): Promise<FrameSample> {
  let frame: FrameSample | undefined
  while (frame === undefined) {
    await nextHostPoll(watch)
    frame = firstFrameAfter(watch.probe.takeFrames(), timeMs)
    if (frame === undefined && performance.now() - timeMs > SAMPLE_LIMIT_MS) {
      throw sampleLimitError(watch.what)
    }
  }
  return frame
}

/** Turns paced mode on and drops the samples of the switch, so no split frame is timed. */
export async function switchToPaced(watch: FrameWatch): Promise<void> {
  const switchedAtMs = performance.now()
  watch.probe.setPaced(true)
  await collectFrames(watch, PACED_SWITCH_DISCARD_FRAMES, switchedAtMs)
}
