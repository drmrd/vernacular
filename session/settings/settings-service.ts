import { InMemorySettingsPort } from '../../storage'
import type { SettingsPort } from '../../storage'

/** One named user setting: its default, and the check that a stored value must pass. */
export interface SettingKey<T> {
  readonly name: string
  readonly defaultValue: T
  readonly parse: (raw: unknown) => T | undefined
}

export interface SettingsService {
  get<T>(key: SettingKey<T>): T
  set<T>(key: SettingKey<T>, value: T): void
  subscribe<T>(key: SettingKey<T>, listener: (value: T) => void): () => void
}

interface Subscription {
  readonly listener: (value: unknown) => void
  live: boolean
}

function readSetting<T>(port: SettingsPort, key: SettingKey<T>): T {
  const raw = port.read(key.name)
  if (raw === undefined) return key.defaultValue
  try {
    return key.parse(raw) ?? key.defaultValue
  } catch {
    return key.defaultValue
  }
}

function notify(subscriptions: ReadonlySet<Subscription> | undefined, value: unknown): void {
  if (subscriptions === undefined) return
  for (const subscription of [...subscriptions]) {
    if (subscription.live) subscription.listener(value)
  }
}

/** With no port, the service keeps its values in memory. */
export function createSettingsService(
  port: SettingsPort = new InMemorySettingsPort(),
): SettingsService {
  const values = new Map<string, unknown>()
  const subscriptions = new Map<string, Set<Subscription>>()

  return {
    get<T>(key: SettingKey<T>): T {
      if (!values.has(key.name)) values.set(key.name, readSetting(port, key))
      return values.get(key.name) as T
    },
    set<T>(key: SettingKey<T>, value: T): void {
      port.write(key.name, value)
      values.set(key.name, value)
      notify(subscriptions.get(key.name), value)
    },
    subscribe<T>(key: SettingKey<T>, listener: (value: T) => void): () => void {
      const subscription: Subscription = {
        listener: listener as (value: unknown) => void,
        live: true,
      }
      const forName = subscriptions.get(key.name) ?? new Set<Subscription>()
      forName.add(subscription)
      subscriptions.set(key.name, forName)
      return () => {
        subscription.live = false
        forName.delete(subscription)
      }
    },
  }
}
