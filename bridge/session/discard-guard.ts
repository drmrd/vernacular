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

/**
 * Collaborators for a guarded destructive swap. `isDirty` is the current
 * project state, `confirm` prompts the user (sync or async) when discarding
 * unsaved work, and `run` performs the swap itself.
 */
export interface GuardDestructiveOptions {
  isDirty: boolean
  confirm: () => boolean | Promise<boolean>
  run: () => void
}

/**
 * Runs a destructive swap, prompting for confirmation only when the project is
 * dirty. A clean project runs `run` directly without consulting `confirm`; a
 * dirty project consults `confirm` and runs `run` only when it resolves truthy.
 * `run` is invoked at most once.
 */
export async function guardDestructive({
  isDirty,
  confirm,
  run,
}: GuardDestructiveOptions): Promise<void> {
  if (needsDiscardConfirmation(isDirty) && !(await confirm())) {
    return
  }
  run()
}
