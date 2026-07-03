import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState } from '../../core'

export interface EnvironmentSessionStore {
  subscribe(listener: () => void): () => void
  getEnvironment(): EnvironmentState
  setEnvironment(next: EnvironmentState): void
}

export function createEnvironmentSessionStore(): EnvironmentSessionStore {
  let environment: EnvironmentState = DEFAULT_ENVIRONMENT_STATE
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
