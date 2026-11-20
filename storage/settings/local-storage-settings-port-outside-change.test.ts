import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemorySettingsPort } from './in-memory-settings-port'
import { LocalStorageSettingsPort } from './local-storage-settings-port'
import {
  browserStorage,
  OLD_SNAP_KEY,
  portListeningTo,
  storageEventOf,
  storageEventSource,
} from './settings-storage-test-kit'

const KEY_PREFIX = 'vernacular.settings.'
const THEME_KEY = `${KEY_PREFIX}theme`
const SHAPE_KEY = `${KEY_PREFIX}shape`
const ACTIVE_PROJECT_KEY = 'vernacular.activeProjectId'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** A port on the storage of this browser that takes its storage events from a source of the test. */
function portWithSource() {
  const source = storageEventSource()
  const port = portListeningTo(browserStorage(), source)
  return { source, port }
}

describe('telling a listener about a setting that another tab changed', () => {
  it('is offered by the browser port', () => {
    expect(new LocalStorageSettingsPort(browserStorage()).onOutsideChange).toBeTypeOf('function')
  })

  it('is not offered by the memory port', () => {
    expect(new InMemorySettingsPort()).not.toHaveProperty('onOutsideChange')
  })

  it('reaches every listener with the name of the setting', () => {
    const { source, port } = portWithSource()
    const first = vi.fn()
    const second = vi.fn()
    port.onOutsideChange(first)
    port.onOutsideChange(second)

    source.emit(storageEventOf(THEME_KEY))

    expect(first).toHaveBeenCalledExactlyOnceWith('theme')
    expect(second).toHaveBeenCalledExactlyOnceWith('theme')
  })

  it('stops reaching a listener that was removed', () => {
    const { source, port } = portWithSource()
    const removed = vi.fn()
    const kept = vi.fn()
    const removeListener = port.onOutsideChange(removed)
    port.onOutsideChange(kept)

    removeListener()
    source.emit(storageEventOf(THEME_KEY))

    expect(removed).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalledExactlyOnceWith('theme')
  })

  it('reads the value that the storage holds now, not the one that was kept in memory', () => {
    const { source, port } = portWithSource()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('The storage is full.', 'QuotaExceededError')
    })
    port.write('theme', 'dark')
    expect(port.read('theme')).toBe('dark')
    localStorage.setItem(THEME_KEY, '"light"')
    port.onOutsideChange(vi.fn())

    source.emit(storageEventOf(THEME_KEY))

    expect(port.read('theme')).toBe('light')
  })
})

describe('telling a listener that the whole storage was cleared', () => {
  it('reaches every listener with every name that the port read or wrote', () => {
    const { source, port } = portWithSource()
    localStorage.setItem(THEME_KEY, '"dark"')
    port.read('theme')
    port.write('shape', { a: 1 })
    const first = vi.fn()
    const second = vi.fn()
    port.onOutsideChange(first)
    port.onOutsideChange(second)

    source.emit(storageEventOf(null))

    for (const listener of [first, second]) {
      expect(listener.mock.calls.map((call) => String(call[0])).sort()).toStrictEqual([
        'shape',
        'theme',
      ])
    }
  })

  it('reaches no listener when nothing was read or written before', () => {
    const { source, port } = portWithSource()
    const listener = vi.fn()
    port.onOutsideChange(listener)

    source.emit(storageEventOf(null))

    expect(listener).not.toHaveBeenCalled()
  })

  it('makes the port read again every setting that it kept in memory', () => {
    const { source, port } = portWithSource()
    const refuseNextTwoWrites = vi.spyOn(Storage.prototype, 'setItem')
    refuseNextTwoWrites.mockImplementation(() => {
      throw new DOMException('The storage is full.', 'QuotaExceededError')
    })
    port.write('theme', 'dark')
    port.write('shape', { a: 1 })
    refuseNextTwoWrites.mockRestore()
    expect(port.read('theme')).toBe('dark')
    expect(port.read('shape')).toStrictEqual({ a: 1 })
    localStorage.setItem(THEME_KEY, '"light"')
    localStorage.setItem(`${KEY_PREFIX}shape`, '{"a":2}')
    port.onOutsideChange(vi.fn())

    source.emit(storageEventOf(null))

    expect(port.read('theme')).toBe('light')
    expect(port.read('shape')).toStrictEqual({ a: 2 })
  })
})

describe('an event that is not about a setting of this port', () => {
  it('reaches no listener when the event comes from another storage area', () => {
    const { source, port } = portWithSource()
    const listener = vi.fn()
    port.onOutsideChange(listener)

    source.emit(storageEventOf(THEME_KEY, 'session'))
    source.emit(storageEventOf(null, 'session'))

    expect(listener).not.toHaveBeenCalled()
  })

  it('reaches no listener when the key is outside the prefix of the port', () => {
    const { source, port } = portWithSource()
    const listener = vi.fn()
    port.onOutsideChange(listener)

    source.emit(storageEventOf(ACTIVE_PROJECT_KEY))
    source.emit(storageEventOf('other'))

    expect(listener).not.toHaveBeenCalled()
  })

  it('reaches no listener when the key is the one that an older build used', () => {
    const { source, port } = portWithSource()
    const listener = vi.fn()
    port.onOutsideChange(listener)

    source.emit(storageEventOf(OLD_SNAP_KEY))

    expect(listener).not.toHaveBeenCalled()
  })

  it('is ignored without an error by a port that has no storage', () => {
    const source = storageEventSource()
    const changed = storageEventOf(THEME_KEY)
    const cleared = storageEventOf(null)
    vi.stubGlobal('localStorage', null)
    const listener = vi.fn()
    new LocalStorageSettingsPort(undefined, source).onOutsideChange(listener)

    expect(() => {
      source.emit(changed)
      source.emit(cleared)
    }).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('listening to the browser for storage events', () => {
  it('starts with the first listener and ends with the last one', () => {
    const { source, port } = portWithSource()
    expect(source.handlerCount()).toBe(0)

    const removeFirst = port.onOutsideChange(vi.fn())
    const removeSecond = port.onOutsideChange(vi.fn())
    expect(source.log).toStrictEqual(['add storage'])
    expect(source.handlerCount()).toBe(1)

    removeFirst()
    expect(source.handlerCount()).toBe(1)
    removeSecond()
    expect(source.log).toStrictEqual(['add storage', 'remove storage'])
    expect(source.handlerCount()).toBe(0)
  })

  it('does not listen at all before a listener is added', () => {
    const { source } = portWithSource()

    expect(source.log).toStrictEqual([])
  })
})

describe('the default source of storage events', () => {
  it('is the global object, so a storage event of the browser reaches a listener', () => {
    const port = new LocalStorageSettingsPort()
    const listener = vi.fn()
    const removeListener = port.onOutsideChange(listener)

    window.dispatchEvent(storageEventOf(SHAPE_KEY))
    removeListener()
    window.dispatchEvent(storageEventOf(THEME_KEY))

    expect(listener).toHaveBeenCalledExactlyOnceWith('shape')
  })
})
