/**
 * The longest wait for a frame. A hidden or minimized window stops frames; a phase that sees no
 * frame for this long throws, so the run is rejected and never hangs.
 */
export const NO_FRAME_LIMIT_MS = 2000

const MILLISECONDS_PER_SECOND = 1000

/** How often the page looks for finished frame samples while it waits, through a timer. */
const POLL_INTERVAL_MS = 20

/** The error of a wait for a frame that never came. */
export function noFrameError(what: string): Error {
  return new Error(
    `No frame arrived within ${NO_FRAME_LIMIT_MS / MILLISECONDS_PER_SECOND} s during ${what}, so nothing was measured. ` +
      'Keep the browser window visible and in front, not minimized, for the whole run.',
  )
}

/** Resolves after the given time, through a timer task. */
export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Resolves on the next task, after the microtasks of the current one (React's sync commit). */
export function nextTask(): Promise<void> {
  return delay(0)
}

/** Resolves after one poll interval: the pace of the page's waits for frame samples. */
export function nextPoll(): Promise<void> {
  return delay(POLL_INTERVAL_MS)
}

/** The next frame, or a rejection after {@link NO_FRAME_LIMIT_MS}. */
export async function frameWithinLimit(
  hostFrame: () => Promise<number>,
  what: string,
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(noFrameError(what)), NO_FRAME_LIMIT_MS)
  })
  try {
    return await Promise.race([hostFrame(), limit])
  } finally {
    clearTimeout(timer)
  }
}

/** Runs a garbage collection when the browser exposes `gc` (the `--expose-gc` flag). */
export function collectGarbage(): void {
  const { gc } = globalThis as { gc?: () => void }
  gc?.()
}
