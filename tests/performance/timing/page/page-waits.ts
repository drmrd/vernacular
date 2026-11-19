/**
 * The longest wait for a host frame, the browser's own animation frame. A hidden or minimized
 * window stops host frames; a wait that sees none for this long throws, so the run is rejected and
 * never hangs. It watches host frames and not frame samples, because paced mode rightly holds the
 * page's callbacks for longer while GPU work is pending.
 */
export const NO_FRAME_LIMIT_MS = 2000

/** The number of milliseconds in a second, for the seconds the messages state. */
export const MILLISECONDS_PER_SECOND = 1000

/**
 * The error of a wait for a host frame that never came. A hidden page stops host frames, so the
 * message asks for a visible window; a visible page whose frames stopped had a stalled browser.
 */
function noFrameError(what: string, limitMs: number): Error {
  const seconds = limitMs / MILLISECONDS_PER_SECOND
  if (document.visibilityState === 'visible') {
    return new Error(
      `The browser stalled for more than ${seconds} s during ${what}, so nothing was measured. ` +
        'Close other heavy applications and run again.',
    )
  }
  return new Error(
    `No frame arrived within ${seconds} s during ${what}, so nothing was measured. ` +
      'Keep the browser window visible and in front, not minimized, for the whole run.',
  )
}

/** Resolves on the next task, after the microtasks of the current one (React's sync commit). */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** The next host frame, or a rejection after the limit, {@link NO_FRAME_LIMIT_MS} by default. */
export async function frameWithinLimit(
  hostFrame: () => Promise<number>,
  what: string,
  limitMs: number = NO_FRAME_LIMIT_MS,
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(noFrameError(what, limitMs)), limitMs)
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
