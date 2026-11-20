import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemorySettingsPort } from './in-memory-settings-port'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import type { SettingsPort } from './settings-port'
import { memoryStorage, refusing } from './settings-storage-test-kit'

const THEME_KEY = 'vernacular.settings.theme'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const BOTH_CLASSES: ReadonlyArray<readonly [string, () => SettingsPort]> = [
  ['InMemorySettingsPort', () => new InMemorySettingsPort()],
  ['LocalStorageSettingsPort', () => new LocalStorageSettingsPort(memoryStorage())],
]

describe('LocalStorageSettingsPort after a refused call is followed by a taken one', () => {
  it('reads from the storage again after a write that follows a refused removal', () => {
    const storage = memoryStorage({ [THEME_KEY]: '"dark"' })
    const port = new LocalStorageSettingsPort(refusing(storage, ['removeItem']))
    port.write('theme', undefined)

    port.write('theme', 'light')

    expect(storage.entries.get(THEME_KEY)).toBe('"light"')
    storage.entries.set(THEME_KEY, '"changed elsewhere"')
    expect(port.read('theme')).toBe('changed elsewhere')
  })

  it('keeps the value of a refused write when a later write has a cycle', () => {
    const port = new LocalStorageSettingsPort(refusing(memoryStorage(), ['setItem']))
    port.write('theme', 'kept in memory')
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic

    expect(() => {
      port.write('theme', cyclic)
    }).toThrow(TypeError)

    expect(port.read('theme')).toBe('kept in memory')
  })
})

describe('LocalStorageSettingsPort where the localStorage global is null', () => {
  it('writes and reads in memory', () => {
    vi.stubGlobal('localStorage', null)
    const port = new LocalStorageSettingsPort()

    port.write('theme', 'dark')

    expect(port.read('theme')).toBe('dark')
    expect(port.read('never-written')).toBeUndefined()
  })
})

describe.each(BOTH_CLASSES)(
  '%s with values that JSON treats in unusual ways',
  (_label, makePort) => {
    it('removes the setting when a symbol is written over a stored value', () => {
      const port = makePort()
      port.write('name', 'stored')

      port.write('name', Symbol('not JSON'))

      expect(port.read('name')).toBeUndefined()
    })

    it('throws a TypeError for a big integer and keeps the earlier value', () => {
      const port = makePort()
      port.write('name', 'earlier')

      expect(() => {
        port.write('name', BigInt(1))
      }).toThrow(TypeError)

      expect(port.read('name')).toBe('earlier')
    })

    it('keeps a __proto__ key as an own key and pollutes no object', () => {
      const port = makePort()
      const value: unknown = JSON.parse('{"__proto__":{"polluted":true},"kept":1}')

      port.write('name', value)
      const read = port.read('name') as Record<string, unknown>

      expect(Object.keys(read)).toStrictEqual(['__proto__', 'kept'])
      expect(read['kept']).toBe(1)
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
      expect(read['polluted']).toBeUndefined()
    })
  },
)
