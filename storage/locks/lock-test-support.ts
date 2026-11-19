/** How long a case waits for a call that may never settle, before it calls it unsettled. */
export const SETTLE_WAIT_MS = 50

/** The value `settledWithinBound` gives when its promise is still pending after the bounded wait. */
export const DID_NOT_SETTLE = Symbol('did not settle')

/**
 * The value of `promise`, or `DID_NOT_SETTLE` when it is still pending after the bounded wait.
 * A rejection of `promise` passes through, so a case can expect it.
 */
export async function settledWithinBound<T>(
  promise: Promise<T>,
): Promise<T | typeof DID_NOT_SETTLE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<typeof DID_NOT_SETTLE>((resolve) => {
    timer = setTimeout(() => resolve(DID_NOT_SETTLE), SETTLE_WAIT_MS)
  })
  try {
    return await Promise.race([promise, bound])
  } finally {
    clearTimeout(timer)
  }
}

/** The error of a browser that refuses the lock API: a `DOMException` named `SecurityError`. */
export function securityRefusal(): DOMException {
  return new DOMException('Access to the Locks API is denied in this context.', 'SecurityError')
}

/**
 * A browser lock manager whose `request` and `query` both reject with `error`. Install it as
 * `navigator.locks` to model a browser that has the Web Locks API and fails every call.
 */
export function rejectingLockManager(error: unknown): {
  request: () => Promise<never>
  query: () => Promise<never>
} {
  return {
    request: () => Promise.reject(error),
    query: () => Promise.reject(error),
  }
}
