/**
 * Decides whether a destructive swap (New / Open / Import) must prompt the user
 * before discarding unsaved work. Confirmation is required only when the project
 * is dirty; a clean project may be replaced without warning. This is the policy
 * seam later C4 issues (#233 error states, #262 degraded storage) extend without
 * disturbing call sites.
 */
export function needsDiscardConfirmation(isDirty: boolean): boolean {
  return isDirty
}
