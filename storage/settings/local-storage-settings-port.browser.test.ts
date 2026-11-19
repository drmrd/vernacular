import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import { assertSettingsPortContract } from './settings-port-contract'

const OLD_KEY = 'vernacular.snap-preferences'
const NEW_KEY = 'vernacular.settings.snapPreferences'
const OLD_TEXT = '{"enabled":false,"kinds":{"grid":false},"pixelRadius":12}'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

assertSettingsPortContract('LocalStorageSettingsPort on the storage of this browser', () => {
  localStorage.clear()
  return new LocalStorageSettingsPort()
})

describe('LocalStorageSettingsPort on the storage of this browser', () => {
  it('carries the snap preferences from the old key', () => {
    localStorage.setItem(OLD_KEY, OLD_TEXT)

    const port = new LocalStorageSettingsPort()

    expect(port.read('snapPreferences')).toStrictEqual({
      enabled: false,
      kinds: { grid: false },
      pixelRadius: 12,
    })
    expect(localStorage.getItem(NEW_KEY)).toBe(OLD_TEXT)
    expect(localStorage.getItem(OLD_KEY)).toBeNull()
  })

  it('stores the JSON text under vernacular.settings and the name', () => {
    const port = new LocalStorageSettingsPort()

    port.write('theme', 'dark')
    port.write('shape', { a: 1, b: [true, null] })

    expect(localStorage.getItem('vernacular.settings.theme')).toBe('"dark"')
    expect(localStorage.getItem('vernacular.settings.shape')).toBe('{"a":1,"b":[true,null]}')
  })
})
