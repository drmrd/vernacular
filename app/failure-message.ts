import { humanMessage } from '../editor/design-system'

// The single source of the error-toast convention: every failed action surfaces
// as "<Action> failed: <reason>", where the reason is the humanized error text
// (issue #326). Lives in its own module so the action hooks can share it without
// importing one another.
export function failureMessage(actionLabel: string, error: unknown): string {
  return `${actionLabel} failed: ${humanMessage(error)}`
}
