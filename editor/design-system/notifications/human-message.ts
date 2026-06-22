/** Map a thrown value to display text. Never returns a stack or an Error object. */
export function humanMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
