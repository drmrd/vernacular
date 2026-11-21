/**
 * The bounded wait for a record write and the warnings that a record write can give. The keeper of
 * the open handle and the note of a failed open both need them, so they live apart from both.
 */

/** The longest time that a close, a hand-over, or a failed open waits for a record write. */
export const RECORD_WAIT_MS = 2000

/** Gives a warning to the console. */
export type Warn = (message: string, error?: unknown) => void

export const READ_WARNING = 'The project index could not read the record of a project.'
export const WRITE_WARNING = 'The project index did not write the record of a project.'
export const WAIT_WARNING =
  'The project index did not answer in time, so the project went on without waiting for its record.'

/** Gives the warning to console.warn. A console that throws changes nothing. */
function warnSafely(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // A console that throws has nowhere left to report to.
  }
}

/** Gives the first warning to the console and is silent for every later one. */
export function createWarnOnce(): Warn {
  let warned = false
  return (message, error) => {
    if (!warned) {
      warned = true
      warnSafely(message, error)
    }
  }
}

/**
 * True when the work settled within `RECORD_WAIT_MS`, false when the time ran out first. The timer
 * is cleared either way. Never rejects.
 */
export async function settlesInTime(work: Promise<void>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), RECORD_WAIT_MS)
  })
  try {
    return await Promise.race([work.then(onSettled, onSettled), timeUp])
  } finally {
    clearTimeout(timer)
  }
}

/** A work that settled, whether it resolved or rejected, settled in time. */
function onSettled(): boolean {
  return true
}
