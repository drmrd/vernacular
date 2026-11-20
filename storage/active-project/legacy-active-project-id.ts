import { isValidProjectId } from './project-id'

/** Where the older build remembered the id of the last active project. */
export const LEGACY_ACTIVE_PROJECT_ID_KEY = 'vernacular.activeProjectId'

/**
 * The id that the older build remembered, left in place; undefined when none is stored or the
 * storage refuses. A value that is not a valid id names no project, so it is removed. Never throws.
 */
export function readLegacyActiveProjectId(): string | undefined {
  let stored: string | null
  try {
    stored = localStorage.getItem(LEGACY_ACTIVE_PROJECT_ID_KEY)
  } catch {
    return undefined
  }
  if (stored === null) {
    return undefined
  }
  if (isValidProjectId(stored)) {
    return stored
  }
  removeLegacyActiveProjectId()
  return undefined
}

/** Removes the id that the older build remembered. Does nothing where the storage refuses. */
export function removeLegacyActiveProjectId(): void {
  try {
    localStorage.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY)
  } catch {
    // A key that stays is harmless: the record under its id ends its effect.
  }
}
