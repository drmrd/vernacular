import { firstFrameAfter, type FrameProbe, type FrameSample } from '../frame-probe'
import { NO_FRAME_LIMIT_MS, nextPoll, noFrameError } from './page-waits'

/** What a wait for frame samples watches: the probe, the health of the live view, and its name. */
export interface FrameWatch {
  readonly probe: FrameProbe
  /** Throws when the live view reported a failure. */
  readonly checkHealth: () => void
  /** What is being drawn, for the messages: a render variant or an edit. */
  readonly what: string
}

/**
 * The next `count` finished frame samples that started at or after `startedAtMs`. The page looks
 * for them on a timer, never in a frame callback of its own. Throws when the live view fails or
 * when no sample arrives for {@link NO_FRAME_LIMIT_MS}.
 */
export async function collectFrames(
  watch: FrameWatch,
  count: number,
  startedAtMs: number,
): Promise<FrameSample[]> {
  const frames: FrameSample[] = []
  let lastArrivalMs = performance.now()
  while (frames.length < count) {
    await nextPoll()
    watch.checkHealth()
    const fresh = watch.probe.takeFrames().filter((frame) => frame.startMs >= startedAtMs)
    if (fresh.length > 0) {
      frames.push(...fresh)
      lastArrivalMs = performance.now()
    } else if (performance.now() - lastArrivalMs > NO_FRAME_LIMIT_MS) {
      throw noFrameError(watch.what)
    }
  }
  return frames.slice(0, count)
}

/**
 * The first finished frame sample that started at or after the time. The samples before it, and
 * the ones after it that finished in the same poll, are dropped. Throws as {@link collectFrames}.
 */
export async function frameStartingAfter(watch: FrameWatch, timeMs: number): Promise<FrameSample> {
  let frame: FrameSample | undefined
  while (frame === undefined) {
    await nextPoll()
    watch.checkHealth()
    frame = firstFrameAfter(watch.probe.takeFrames(), timeMs)
    if (frame === undefined && performance.now() - timeMs > NO_FRAME_LIMIT_MS) {
      throw noFrameError(watch.what)
    }
  }
  return frame
}
