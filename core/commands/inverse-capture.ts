export interface CapturedInverse {
  revert(): void
}

interface PriorState {
  existed: boolean
  value: unknown
}

/**
 * Records the first-touch prior state of each top-level key so a command can be
 * reverted by restoring those keys. Command handlers update state immutably by
 * reassigning whole top-level slices (`state.floors = next`), so only the root's
 * own properties change; nested objects are never deep-proxied.
 */
export function captureInverse<S extends object>(
  root: S,
): {
  state: S
  inverse: CapturedInverse
} {
  const record = new Map<PropertyKey, PriorState>()

  const remember = (target: S, key: PropertyKey): void => {
    if (record.has(key)) {
      return
    }
    record.set(key, { existed: key in target, value: Reflect.get(target, key) })
  }

  const state = new Proxy(root, {
    set(target, key, value): boolean {
      remember(target, key)
      return Reflect.set(target, key, value)
    },
    deleteProperty(target, key): boolean {
      remember(target, key)
      return Reflect.deleteProperty(target, key)
    },
  })

  const revert = (): void => {
    for (const [key, prior] of record) {
      if (prior.existed) {
        Reflect.set(root, key, prior.value)
      } else {
        Reflect.deleteProperty(root, key)
      }
    }
  }

  return { state, inverse: { revert } }
}
