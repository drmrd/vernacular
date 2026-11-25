import type { ReadFailed } from './handle-types'

function hasTextMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

/**
 * The message of a thrown value: the message of an Error or of any object with
 * a text message, and the value as text otherwise. Some environments give a
 * DOMException that is not an Error, and its message still reads best alone.
 */
export function messageOf(error: unknown): string {
  return hasTextMessage(error) ? error.message : String(error)
}

/** A failure for a step whose storage did not answer. */
export function storageUnavailable(error: unknown): ReadFailed {
  return { ok: false, failure: { kind: 'storage-unavailable', message: messageOf(error) } }
}
