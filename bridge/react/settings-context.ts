import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createSettingsService, type SettingKey, type SettingsService } from '../../session'

const SettingsContext = createContext<SettingsService | null>(null)

export interface SettingsProviderProps {
  service: SettingsService
  children: ReactNode
}

export function SettingsProvider({ service, children }: SettingsProviderProps): ReactElement {
  return createElement(SettingsContext.Provider, { value: service }, children)
}

/**
 * The service of the nearest provider. With no provider, a memory service that belongs to this one
 * call of the hook: the same object on every render of that mounted component, and another object
 * for another call or another component. Two readers that must share a setting need a
 * `SettingsProvider` above them. Under a provider, each call still makes one small unused memory
 * service.
 */
export function useSettingsService(): SettingsService {
  const provided = useContext(SettingsContext)
  const [ownService] = useState(() => createSettingsService())
  return provided ?? ownService
}

export function useSetting<T>(
  key: SettingKey<T>,
): readonly [value: T, setValue: (value: T) => void] {
  const service = useSettingsService()
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribe(key, onChange),
    [service, key],
  )
  const getSnapshot = useCallback(() => service.get(key), [service, key])
  const value = useSyncExternalStore(subscribe, getSnapshot)
  const setValue = useCallback((next: T) => service.set(key, next), [service, key])
  return [value, setValue]
}
