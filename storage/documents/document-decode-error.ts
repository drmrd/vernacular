import type { DecodeFailure } from '../../core'

/** Thrown when stored bytes cannot be read as a project document; `failure` says why. */
export class DocumentDecodeError extends Error {
  readonly failure: DecodeFailure

  constructor(failure: DecodeFailure) {
    super(`The stored document could not be read: ${failure.kind}`)
    this.name = 'DocumentDecodeError'
    this.failure = failure
  }
}
