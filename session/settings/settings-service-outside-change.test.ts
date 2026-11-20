import { describe, expect, it, vi } from 'vitest'
import { InMemorySettingsPort } from '../../storage'
import { createSettingsService } from './settings-service'
import {
  parseText,
  parseTextInCapitals,
  portWithOutsideChanges,
  TEXT_DEFAULT,
  TEXT_NAME,
  textKeyWith,
} from './settings-service-test-support'

const OTHER_NAME = 'other'

describe('a service over a port that tells of changes from outside', () => {
  it('listens from the start and for its whole life', () => {
    const port = portWithOutsideChanges()
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    expect(port.listenerCount()).toBeGreaterThan(0)

    service.subscribe(key, vi.fn())()

    expect(port.listenerCount()).toBeGreaterThan(0)
  })

  it('gives a subscriber the new value of a setting that another tab changed', () => {
    const port = portWithOutsideChanges()
    port.write(TEXT_NAME, 'before')
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    const subscriber = vi.fn()
    service.subscribe(key, subscriber)
    expect(service.get(key)).toBe('before')

    port.changeOutside(TEXT_NAME, 'after')

    expect(subscriber).toHaveBeenCalledExactlyOnceWith('after')
    expect(service.get(key)).toBe('after')
  })

  it('gives the default when the new value of the setting fails the check', () => {
    const port = portWithOutsideChanges()
    port.write(TEXT_NAME, 'before')
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    const subscriber = vi.fn()
    service.subscribe(key, subscriber)
    service.get(key)

    port.changeOutside(TEXT_NAME, 42)

    expect(subscriber).toHaveBeenCalledExactlyOnceWith(TEXT_DEFAULT)
  })

  it('calls no subscriber of another setting', () => {
    const port = portWithOutsideChanges()
    const service = createSettingsService(port)
    const changed = vi.fn()
    const unchanged = vi.fn()
    service.subscribe(textKeyWith(parseText), changed)
    service.subscribe(textKeyWith(parseText, OTHER_NAME), unchanged)

    port.changeOutside(TEXT_NAME, 'after')

    expect(changed).toHaveBeenCalledExactlyOnceWith('after')
    expect(unchanged).not.toHaveBeenCalled()
  })

  it('gives each subscriber the value that its own key gives', () => {
    const port = portWithOutsideChanges()
    const service = createSettingsService(port)
    const plain = vi.fn()
    const capitals = vi.fn()
    service.subscribe(textKeyWith(parseText), plain)
    service.subscribe(textKeyWith(parseTextInCapitals), capitals)

    port.changeOutside(TEXT_NAME, 'after')

    expect(plain).toHaveBeenCalledExactlyOnceWith('after')
    expect(capitals).toHaveBeenCalledExactlyOnceWith('AFTER')
  })

  it('gives subscribers and get the default when another tab removed the setting', () => {
    const port = portWithOutsideChanges()
    port.write(TEXT_NAME, 'before')
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    const subscriber = vi.fn()
    service.subscribe(key, subscriber)
    expect(service.get(key)).toBe('before')

    port.changeOutside(TEXT_NAME, undefined)

    expect(subscriber).toHaveBeenCalledExactlyOnceWith(TEXT_DEFAULT)
    expect(service.get(key)).toBe(TEXT_DEFAULT)
  })

  it('gives the new value to get after a change that nobody subscribed to', () => {
    const port = portWithOutsideChanges()
    port.write(TEXT_NAME, 'before')
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    expect(service.get(key)).toBe('before')

    port.changeOutside(TEXT_NAME, 'after')

    expect(service.get(key)).toBe('after')
  })

  it('does not call a subscriber that another subscriber removed during the same change', () => {
    const port = portWithOutsideChanges()
    const service = createSettingsService(port)
    const key = textKeyWith(parseText)
    const removals: (() => void)[] = []
    service.subscribe(key, () => {
      removals.forEach((remove) => remove())
    })
    const removed = vi.fn()
    removals.push(service.subscribe(key, removed))

    port.changeOutside(TEXT_NAME, 'after')

    expect(removed).not.toHaveBeenCalled()
  })

  it('tells the subscribers of two services over one port of a change from another tab', () => {
    const port = portWithOutsideChanges()
    const key = textKeyWith(parseText)
    const firstService = createSettingsService(port)
    const secondService = createSettingsService(port)
    const first = vi.fn()
    const second = vi.fn()
    firstService.subscribe(key, first)
    secondService.subscribe(key, second)

    port.changeOutside(TEXT_NAME, 'after')

    expect(first).toHaveBeenCalledExactlyOnceWith('after')
    expect(second).toHaveBeenCalledExactlyOnceWith('after')
    expect(firstService.get(key)).toBe('after')
    expect(secondService.get(key)).toBe('after')
  })
})

describe('a service over a port that has no way to tell of changes from outside', () => {
  it('still gives, sets, and tells subscribers of a set', () => {
    const service = createSettingsService(new InMemorySettingsPort())
    const key = textKeyWith(parseText)
    const subscriber = vi.fn()
    service.subscribe(key, subscriber)

    service.set(key, 'set here')

    expect(service.get(key)).toBe('set here')
    expect(subscriber).toHaveBeenCalledExactlyOnceWith('set here')
  })
})
