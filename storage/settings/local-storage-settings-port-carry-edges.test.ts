import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import {
  dropping,
  memoryStorage,
  refusing,
  refusingReadOf,
  storingOtherText,
} from './settings-storage-test-kit'

const OLD_KEY = 'vernacular.snap-preferences'
const NEW_KEY = 'vernacular.settings.snapPreferences'
const SETTING = 'snapPreferences'

const OLD_TEXT = '{"enabled":false,"kinds":{"grid":false},"pixelRadius":12}'
const OLD_VALUE = { enabled: false, kinds: { grid: false }, pixelRadius: 12 }
const OTHER_TEXT = '{"enabled":true}'
const READ_BACK_CALL = 2

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LocalStorageSettingsPort carrying beside storage faults that are easy to miss', () => {
  it('does nothing when only the read of the new key throws', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')
    let port: LocalStorageSettingsPort | undefined

    expect(() => {
      port = new LocalStorageSettingsPort(refusingReadOf(storage, NEW_KEY))
    }).not.toThrow()

    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(port?.read(SETTING)).toBeUndefined()
  })

  it('keeps the old key and the value when the storage keeps other text than it was given', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })

    const port = new LocalStorageSettingsPort(storingOtherText(storage, OTHER_TEXT))

    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(port.read(SETTING)).toStrictEqual(OLD_VALUE)
  })

  it('keeps the old key and the value when the read back of the new key throws', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    let port: LocalStorageSettingsPort | undefined

    expect(() => {
      port = new LocalStorageSettingsPort(refusingReadOf(storage, NEW_KEY, READ_BACK_CALL))
    }).not.toThrow()

    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(port?.read(SETTING)).toStrictEqual(OLD_VALUE)
  })

  it('ends the memory copy of a failed carry when a later write is taken', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT })
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('The storage is full.', 'QuotaExceededError')
    })
    const port = new LocalStorageSettingsPort(storage)
    const updated = { enabled: true, pixelRadius: 20 }

    port.write(SETTING, updated)

    expect(storage.entries.get(NEW_KEY)).toBe(JSON.stringify(updated))
    expect(port.read(SETTING)).toStrictEqual(updated)
    storage.entries.set(NEW_KEY, OTHER_TEXT)
    expect(port.read(SETTING)).toStrictEqual({ enabled: true })
  })
})

describe('LocalStorageSettingsPort carrying empty text', () => {
  it('carries an empty old text as it is and reads undefined', () => {
    const storage = memoryStorage({ [OLD_KEY]: '' })

    const port = new LocalStorageSettingsPort(storage)

    expect(storage.entries.get(NEW_KEY)).toBe('')
    expect(storage.entries.has(OLD_KEY)).toBe(false)
    expect(port.read(SETTING)).toBeUndefined()
  })

  it('counts an empty text under the new key as text and leaves both keys alone', () => {
    const storage = memoryStorage({ [OLD_KEY]: OLD_TEXT, [NEW_KEY]: '' })
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')

    new LocalStorageSettingsPort(storage)

    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(storage.entries.get(OLD_KEY)).toBe(OLD_TEXT)
    expect(storage.entries.get(NEW_KEY)).toBe('')
  })
})

describe('LocalStorageSettingsPort logging while carrying', () => {
  it('logs nothing on any failure path of the carry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const stored = (text: string) => memoryStorage({ [OLD_KEY]: text })

    const ports = [
      new LocalStorageSettingsPort(refusing(stored(OLD_TEXT), ['setItem'])),
      new LocalStorageSettingsPort(dropping(stored(OLD_TEXT))),
      new LocalStorageSettingsPort(refusing(stored(OLD_TEXT), ['removeItem'])),
      new LocalStorageSettingsPort(stored('not json {')),
      new LocalStorageSettingsPort(refusing(stored(OLD_TEXT), ['getItem'])),
    ]
    ports.forEach((port) => port.read(SETTING))

    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
