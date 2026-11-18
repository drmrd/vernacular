import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'

const DOT_SEGMENTS: readonly string[] = ['.', '..']

/** Why `id` cannot name a project directory, or undefined when it can. */
function invalidReason(id: string): string | undefined {
  if (id === '') {
    return 'an id cannot be empty'
  }
  if (id.includes('/') || id.includes('\\')) {
    return 'an id is one path segment, so it cannot hold a slash or a backslash'
  }
  if (DOT_SEGMENTS.includes(id)) {
    return 'an id cannot be a dot segment'
  }
  if (id === ASSET_DIRECTORY_PREFIX) {
    return `"${ASSET_DIRECTORY_PREFIX}" is reserved for the shared asset pool`
  }
  return undefined
}

/** A project id that cannot name a project directory. The message says why. */
export class InvalidProjectIdError extends Error {
  constructor(id: string, reason: string) {
    super(`${JSON.stringify(id)} is not a valid project id: ${reason}.`)
    this.name = 'InvalidProjectIdError'
  }
}

/**
 * Throws unless `id` is one plain path segment that is not a reserved name. A
 * project id names a directory, so it must not reach the shared asset pool or
 * leave its own directory.
 */
export function assertProjectId(id: string): void {
  const reason = invalidReason(id)
  if (reason !== undefined) {
    throw new InvalidProjectIdError(id, reason)
  }
}
