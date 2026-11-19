/** Runs the call; an error it throws goes to the console, so the callers after it still run. */
export function callGuarded(call: () => void): void {
  try {
    call()
  } catch (error) {
    console.error(error)
  }
}

/** Awaits the call; an error it throws or a promise it rejects goes to the console. Never rejects. */
export async function callGuardedAsync(call: () => Promise<unknown>): Promise<void> {
  try {
    await call()
  } catch (error) {
    console.error(error)
  }
}
