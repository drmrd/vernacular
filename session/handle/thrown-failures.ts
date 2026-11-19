import type { OpenFailed } from './handle-types'

/** The message of a thrown value: the message of an Error, and the value as text otherwise. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A failure for a step whose storage did not answer. */
export function storageUnavailable(error: unknown): OpenFailed {
  return { ok: false, failure: { kind: 'storage-unavailable', message: messageOf(error) } }
}
