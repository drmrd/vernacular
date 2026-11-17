import type { DecodeFailure } from '../../core'

/** One plain sentence that says what failed; a new kind of failure fails the typecheck here. */
function describeFailure(failure: DecodeFailure): string {
  switch (failure.kind) {
    case 'newer-version':
      return `A newer version of the application saved this document (version ${failure.version}); this version reads up to version ${failure.buildVersion}.`
    case 'migration-failed':
      return `The document was saved at version ${failure.fromVersion} and could not be upgraded: ${failure.message}.`
    case 'not-json':
      return `The stored file is not valid JSON: ${failure.message}.`
    case 'not-a-project':
      return 'The stored file is not a project document.'
    case 'format-rules':
      return 'The stored document breaks the format rules.'
  }
}

/** Thrown when stored bytes cannot be read as a project document; `failure` says why. */
export class DocumentDecodeError extends Error {
  readonly failure: DecodeFailure

  constructor(failure: DecodeFailure) {
    super(describeFailure(failure))
    this.name = 'DocumentDecodeError'
    this.failure = failure
  }
}
