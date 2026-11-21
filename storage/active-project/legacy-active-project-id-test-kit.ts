/**
 * Shared set-up of the tests that meet the id that the first stage of the application remembered.
 * Tests outside `storage/` reach the browser storage only through these functions.
 */

/** The key under which the first stage remembered the id of its active project. */
const LEGACY_ACTIVE_PROJECT_ID_KEY = 'vernacular.activeProjectId'

/** Stores `value` under the key of the first stage, as an older build of the application did. */
export function plantLegacyActiveProjectId(value: string): void {
  localStorage.setItem(LEGACY_ACTIVE_PROJECT_ID_KEY, value)
}

/** Whether any value is stored under the key of the first stage. */
export function legacyActiveProjectIdIsStored(): boolean {
  return localStorage.getItem(LEGACY_ACTIVE_PROJECT_ID_KEY) !== null
}

/** The value stored under the key of the first stage, or null when there is none. */
export function storedLegacyActiveProjectId(): string | null {
  return localStorage.getItem(LEGACY_ACTIVE_PROJECT_ID_KEY)
}

/** Removes any value under the key of the first stage, as a browser with no older build has it. */
export function clearLegacyActiveProjectId(): void {
  localStorage.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY)
}
