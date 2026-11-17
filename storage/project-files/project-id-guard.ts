import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'

const RESERVED_IDS: readonly string[] = ['.', '..', ASSET_DIRECTORY_PREFIX]

/**
 * A project id that cannot name a project directory. The message is the id as
 * written, so that a caller can match on it; the error name carries the reason.
 */
export class InvalidProjectIdError extends Error {
  constructor(id: string) {
    super(id)
    this.name = 'InvalidProjectIdError'
  }
}

/**
 * Throws unless `id` is one plain path segment that is not a reserved name. A
 * project id names a directory, so it must not reach the shared asset pool or
 * leave its own directory.
 */
export function assertProjectId(id: string): void {
  const isOneSegment = id !== '' && !id.includes('/') && !id.includes('\\')
  if (!isOneSegment || RESERVED_IDS.includes(id)) {
    throw new InvalidProjectIdError(id)
  }
}
