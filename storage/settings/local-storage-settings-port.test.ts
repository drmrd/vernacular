import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import type { SettingsStorage } from './local-storage-settings-port'
import { assertSettingsPortContract } from './settings-port-contract'
import { memoryStorage, OLD_SNAP_KEY, refusing } from './settings-storage-test-kit'

const KEY_PREFIX = 'vernacular.settings.'
const THEME_KEY = `${KEY_PREFIX}theme`
const ACTIVE_PROJECT_KEY = 'vernacular.activeProjectId'
const UNRELATED_KEY = 'other'

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalLocalStorage !== undefined) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  }
})

function portOnTheStorageOfTheBrowser(): LocalStorageSettingsPort {
  localStorage.clear()
  return new LocalStorageSettingsPort()
}

function portWhereTheGlobalIsMissing(): LocalStorageSettingsPort {
  vi.stubGlobal('localStorage', undefined)
  return new LocalStorageSettingsPort()
}

function portWhereTheGlobalThrows(): LocalStorageSettingsPort {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get(): never {
      throw new DOMException('The browser refuses its storage.', 'SecurityError')
    },
  })
  return new LocalStorageSettingsPort()
}

assertSettingsPortContract(
  'LocalStorageSettingsPort on a memory storage',
  () => new LocalStorageSettingsPort(memoryStorage()),
)
assertSettingsPortContract(
  'LocalStorageSettingsPort on the storage of the browser',
  portOnTheStorageOfTheBrowser,
)
assertSettingsPortContract(
  'LocalStorageSettingsPort on a storage that refuses every call',
  () =>
    new LocalStorageSettingsPort(refusing(memoryStorage(), ['getItem', 'setItem', 'removeItem'])),
)
assertSettingsPortContract(
  'LocalStorageSettingsPort where the localStorage global is missing',
  portWhereTheGlobalIsMissing,
)
assertSettingsPortContract(
  'LocalStorageSettingsPort where reading localStorage throws',
  portWhereTheGlobalThrows,
)

describe('LocalStorageSettingsPort storage format', () => {
  it('stores the JSON text under vernacular.settings and the name', () => {
    const storage = memoryStorage()
    const port = new LocalStorageSettingsPort(storage)

    port.write('theme', 'dark')
    port.write('shape', { a: 1, b: [true, null] })

    expect(storage.entries.get(THEME_KEY)).toBe('"dark"')
    expect(storage.entries.get(`${KEY_PREFIX}shape`)).toBe('{"a":1,"b":[true,null]}')
  })

  it('reads text that the storage already holds', () => {
    const storage = memoryStorage({ [THEME_KEY]: '"light"', [`${KEY_PREFIX}count`]: '3' })
    const port = new LocalStorageSettingsPort(storage)

    expect(port.read('theme')).toBe('light')
    expect(port.read('count')).toBe(3)
  })

  it('reads undefined for stored text that is not JSON and leaves the text', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'not json {' })
    const port = new LocalStorageSettingsPort(storage)

    expect(port.read('theme')).toBeUndefined()
    expect(storage.entries.get(THEME_KEY)).toBe('not json {')
  })

  it('removes the key when undefined is written', () => {
    const storage = memoryStorage()
    const port = new LocalStorageSettingsPort(storage)
    port.write('theme', 'dark')

    port.write('theme', undefined)

    expect(storage.entries.has(THEME_KEY)).toBe(false)
    expect(port.read('theme')).toBeUndefined()
  })
})

describe('LocalStorageSettingsPort on a storage that refuses a call', () => {
  it('reads undefined when the storage refuses the read', () => {
    const storage = memoryStorage({ [THEME_KEY]: '"dark"' })
    const port = new LocalStorageSettingsPort(refusing(storage, ['getItem']))

    expect(port.read('theme')).toBeUndefined()
  })

  it('keeps a value in memory when the storage refuses the write', () => {
    const storage = memoryStorage({ [`${KEY_PREFIX}other`]: '1' })
    const before = [...storage.entries]
    const port = new LocalStorageSettingsPort(refusing(storage, ['setItem']))

    port.write('theme', 'dark')

    expect(port.read('theme')).toBe('dark')
    expect([...storage.entries]).toStrictEqual(before)
  })

  it('stores the next write once the storage takes writes again', () => {
    const storage = memoryStorage()
    const refusal = new DOMException('The storage is full.', 'QuotaExceededError')
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw refusal
    })
    const port = new LocalStorageSettingsPort(storage)

    port.write('theme', 'dark')
    port.write('theme', 'light')

    expect(storage.entries.get(THEME_KEY)).toBe('"light"')
    expect(port.read('theme')).toBe('light')
    storage.entries.set(THEME_KEY, '"changed elsewhere"')
    expect(port.read('theme')).toBe('changed elsewhere')
  })

  it('remembers a removal that the storage refuses', () => {
    const storage = memoryStorage({ [THEME_KEY]: '"dark"' })
    const port = new LocalStorageSettingsPort(refusing(storage, ['removeItem']))

    port.write('theme', undefined)

    expect(port.read('theme')).toBeUndefined()
    expect(storage.entries.get(THEME_KEY)).toBe('"dark"')
  })
})

function watchKeys(storage: SettingsStorage): () => string[] {
  const getItem = vi.spyOn(storage, 'getItem')
  const setItem = vi.spyOn(storage, 'setItem')
  const removeItem = vi.spyOn(storage, 'removeItem')
  return () =>
    [getItem, setItem, removeItem].flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))
}

describe('LocalStorageSettingsPort beside other users of the storage', () => {
  it('leaves every key outside its prefix alone', () => {
    const outside = { [ACTIVE_PROJECT_KEY]: 'project-1', [UNRELATED_KEY]: 'kept' }
    const storage = memoryStorage(outside)
    const keysCalled = watchKeys(storage)
    const port = new LocalStorageSettingsPort(storage)

    port.read('theme')
    port.write('theme', 'dark')
    port.write('shape', { a: 1 })
    port.write('theme', undefined)
    port.read('theme')

    expect(storage.entries.get(ACTIVE_PROJECT_KEY)).toBe('project-1')
    expect(storage.entries.get(UNRELATED_KEY)).toBe('kept')
    expect(keysCalled()).not.toContain(ACTIVE_PROJECT_KEY)
    expect(keysCalled()).not.toContain(UNRELATED_KEY)
    const called = keysCalled()
    expect(called.filter((key) => key.startsWith(KEY_PREFIX) || key === OLD_SNAP_KEY)).toEqual(
      called,
    )
  })

  it('two ports over one storage read each other writes', () => {
    const storage = memoryStorage()
    const first = new LocalStorageSettingsPort(storage)
    const second = new LocalStorageSettingsPort(storage)

    first.write('theme', 'dark')
    second.write('snap', { enabled: false })
    expect(second.read('theme')).toBe('dark')
    expect(first.read('snap')).toStrictEqual({ enabled: false })

    first.write('same', 'from the first')
    second.write('same', 'from the second')
    expect(first.read('same')).toBe('from the second')
    expect(second.read('same')).toBe('from the second')
  })

  it('logs nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const stored = { [THEME_KEY]: '"dark"' }

    const refusedRead = new LocalStorageSettingsPort(refusing(memoryStorage(stored), ['getItem']))
    refusedRead.read('theme')
    const refusedWrite = new LocalStorageSettingsPort(refusing(memoryStorage(), ['setItem']))
    refusedWrite.write('theme', 'dark')
    refusedWrite.read('theme')
    const refusedRemoval = new LocalStorageSettingsPort(
      refusing(memoryStorage(stored), ['removeItem']),
    )
    refusedRemoval.write('theme', undefined)
    refusedRemoval.read('theme')

    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
