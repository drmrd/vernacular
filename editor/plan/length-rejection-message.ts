import { InvalidLengthError } from '../../core'

/**
 * Returns the domain error message when `err` is a dispatcher-wrapped
 * InvalidLengthError, otherwise null. Call from any length field's catch
 * block to surface a recoverable inline error.
 */
export function lengthRejectionMessage(err: unknown): string | null {
  if (err instanceof Error && err.cause instanceof InvalidLengthError) {
    return err.cause.message
  }
  return null
}
