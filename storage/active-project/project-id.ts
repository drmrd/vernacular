const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/
const NEW_PROJECT_ID_PREFIX = 'project-'

/** Letters, digits, and hyphens; 1 to 64 characters; starts with a letter or digit. */
export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_PATTERN.test(id)
}

/** `project-` and a random UUID, never one of `existing`. */
export function newProjectId(existing: readonly string[]): string {
  let candidate: string
  do {
    candidate = `${NEW_PROJECT_ID_PREFIX}${crypto.randomUUID()}`
  } while (existing.includes(candidate))
  return candidate
}
