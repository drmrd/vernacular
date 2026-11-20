import type { SettingKey, SettingsService } from '../../session'
import { createSettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'

/** Shared set-up of the tests of the settings provider and hooks: keys, recordings, and counters. */

export const GREETING: SettingKey<string> = {
  name: 'greeting',
  defaultValue: 'hello',
  parse: (raw) => (typeof raw === 'string' ? raw : undefined),
}

export const VOLUME: SettingKey<number> = {
  name: 'volume',
  defaultValue: 5,
  parse: (raw) => (typeof raw === 'number' ? raw : undefined),
}

export interface Frame {
  readonly width: number
}

export const FRAME: SettingKey<Frame> = {
  name: 'frame',
  defaultValue: { width: 1 },
  parse: (raw) =>
    typeof raw === 'object' && raw !== null && 'width' in raw && typeof raw.width === 'number'
      ? { width: raw.width }
      : undefined,
}

/** What a reader component saw: each value it rendered, and the setter of each render. */
export interface Recording<T> {
  readonly values: T[]
  readonly setters: Array<(value: T) => void>
}

export function recording<T>(): Recording<T> {
  return { values: [], setters: [] }
}

/** A settings service over a port that already holds `stored` under `name`. */
export function serviceHolding(name: string, stored: unknown): SettingsService {
  const port = new InMemorySettingsPort()
  port.write(name, stored)
  return createSettingsService(port)
}

interface SubscriptionCounts {
  started: number
  ended: number
}

/** A service that counts each subscription that starts and each one that ends. */
export function counting(service: SettingsService): {
  service: SettingsService
  counts: SubscriptionCounts
} {
  const counts: SubscriptionCounts = { started: 0, ended: 0 }
  const counted: SettingsService = {
    get: (key) => service.get(key),
    set: (key, value) => {
      service.set(key, value)
    },
    subscribe: (key, listener) => {
      counts.started += 1
      const end = service.subscribe(key, listener)
      return () => {
        counts.ended += 1
        end()
      }
    },
  }
  return { service: counted, counts }
}
