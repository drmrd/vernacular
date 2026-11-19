import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import { dropping, memoryStorage, refusing } from './settings-storage-test-kit'

const OLD_KEY = 'vernacular.snap-preferences'
const NEW_KEY = 'vernacular.settings.snapPreferences'
const SETTING = 'snapPreferences'

const OLD_TEXT = '{"enabled":false,"kinds":{"grid":false},"pixelRadius":12}'
const OLD_VALUE = { enabled: false, kinds: { grid: false }, pixelRadius: 12 }
const NEW_TEXT = '{"enabled":true}'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LocalStorageSettingsPort carrying the old snap preferences key', () => {
  it('carries the snap preferences from the old key', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })

    const port = new LocalStorageSettingsPort(storage)

    expect(port.read(SETTING)).toStrictEqual(OLD_VALUE)
    expect(storage.entries.get(NEW_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.has(OLD_KEY)).toBe(false)
  })

  it('copies the old text unchanged', () => {
    const unusual = ' {\n  "enabled" : false ,"futureMember":[1, 2],  "pixelRadius":12 }\n'
    const storage = memoryStorage({ [OLD_KEY]: unusual })

    new LocalStorageSettingsPort(storage)

    expect(storage.entries.get(NEW_KEY)).toBe(unusual)
  })

  it('leaves both keys alone when the new key already holds a value', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT, [NEW_KEY]: NEW_TEXT })
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')

    const port = new LocalStorageSettingsPort(storage)

    expect(port.read(SETTING)).toStrictEqual({ enabled: true })
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.get(NEW_KEY)).toBe(NEW_TEXT)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('finds nothing to do the second time', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    new LocalStorageSettingsPort(storage)
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')

    const second = new LocalStorageSettingsPort(storage)

    expect(second.read(SETTING)).toStrictEqual(OLD_VALUE)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('carries nothing when no old key exists', () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')

    const port = new LocalStorageSettingsPort(storage)

    expect(port.read(SETTING)).toBeUndefined()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})

describe('LocalStorageSettingsPort when the carry meets a storage that fails', () => {
  it('keeps the old key when the storage refuses the write, and still reads the value', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })

    const port = new LocalStorageSettingsPort(refusing(storage, ['setItem']))

    expect(port.read(SETTING)).toStrictEqual(OLD_VALUE)
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.has(NEW_KEY)).toBe(false)
  })

  it('keeps the old key when the new key does not read back, and still reads the value', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })

    const port = new LocalStorageSettingsPort(dropping(storage))

    expect(port.read(SETTING)).toStrictEqual(OLD_VALUE)
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.has(NEW_KEY)).toBe(false)
  })

  it('reads the value although the removal of the old key is refused', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })

    const port = new LocalStorageSettingsPort(refusing(storage, ['removeItem']))

    expect(port.read(SETTING)).toStrictEqual(OLD_VALUE)
    expect(storage.entries.get(NEW_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
  })

  it('does nothing when the storage refuses the read of the old key', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    let port: LocalStorageSettingsPort | undefined

    expect(() => {
      port = new LocalStorageSettingsPort(refusing(storage, ['getItem']))
    }).not.toThrow()

    expect(port?.read(SETTING)).toBeUndefined()
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.has(NEW_KEY)).toBe(false)
  })
})

describe('LocalStorageSettingsPort after the carry', () => {
  it('carries old text that is not JSON as it is', () => {
    const storage = memoryStorage({ [OLD_KEY]: 'not json {' })

    const port = new LocalStorageSettingsPort(storage)

    expect(storage.entries.get(NEW_KEY)).toBe('not json {')
    expect(storage.entries.has(OLD_KEY)).toBe(false)
    expect(port.read(SETTING)).toBeUndefined()
  })

  it('a write after the carry replaces the carried value', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    const port = new LocalStorageSettingsPort(storage)

    port.write(SETTING, { enabled: true })

    expect(storage.entries.get(NEW_KEY)).toBe(NEW_TEXT)
    expect(storage.entries.has(OLD_KEY)).toBe(false)
    expect(port.read(SETTING)).toStrictEqual({ enabled: true })
  })
})
