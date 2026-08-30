import { InvalidLengthError } from '../../core'

// parseLength throws a bare Error (no cause) for unparseable text, so a fallback
// is needed: a rejection with no message would leave the field looking broken
// rather than explaining what input is expected.
const GENERIC_REJECTION_MESSAGE = 'Enter a number, or a length such as 2.4 m or 8 ft 6 in.'

const APPLICATION_FAILURE_MESSAGE = 'That change could not be applied. Your entry was not saved.'

/**
 * Returns the domain error message when `err` is a dispatcher-wrapped
 * InvalidLengthError. Returns a message admitting the application failed
 * when `err` carries a cause that is not an InvalidLengthError, since the
 * dispatcher wraps every failed command (not only domain rejections), so a
 * non-domain cause means something other than the user's text broke.
 * Otherwise returns a generic hint describing accepted length formats. Call
 * from any length field's catch block to surface a recoverable inline error;
 * the return value is always safe to show.
 */
export function lengthRejectionMessage(err: unknown): string {
  if (err instanceof Error && err.cause instanceof InvalidLengthError) {
    return err.cause.message
  }
  if (err instanceof Error && err.cause !== undefined) {
    return APPLICATION_FAILURE_MESSAGE
  }
  return GENERIC_REJECTION_MESSAGE
}
