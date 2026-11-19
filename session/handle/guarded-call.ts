/** Runs the call; an error it throws goes to the console, so the callers after it still run. */
export function callGuarded(call: () => void): void {
  try {
    call()
  } catch (error) {
    console.error(error)
  }
}
