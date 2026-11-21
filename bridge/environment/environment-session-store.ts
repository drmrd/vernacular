import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState } from '../../core'

export interface EnvironmentSessionStore {
  subscribe(listener: () => void): () => void
  getEnvironment(): EnvironmentState
  setEnvironment(next: EnvironmentState): void
}

/**
 * Creates the session store of the environment. `startState` is the state it
 * opens with: the opening conditions of the project, or the default state when
 * none is given.
 */
export function createEnvironmentSessionStore(
  startState: EnvironmentState = DEFAULT_ENVIRONMENT_STATE,
): EnvironmentSessionStore {
  let environment: EnvironmentState = startState
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getEnvironment: () => environment,
    setEnvironment: (next) => {
      environment = next
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
