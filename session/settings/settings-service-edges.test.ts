import { describe, expect, it, vi } from 'vitest'
import { InMemorySettingsPort } from '../../storage'
import { createSettingsService } from './settings-service'
import { parseText, TEXT_DEFAULT, TEXT_NAME, textKeyWith } from './settings-service-test-support'

function serviceWithSpiedPort() {
  const port = new InMemorySettingsPort()
  const read = vi.spyOn(port, 'read')
  return { port, read, service: createSettingsService(port) }
}

describe('a default that was kept after a refused stored value', () => {
  it('is given again without reading the port again when the check gives nothing', () => {
    const parse = vi.fn(parseText)
    const { port, read, service } = serviceWithSpiedPort()
    port.write(TEXT_NAME, 42)
    read.mockClear()
    const key = textKeyWith(parse)

    expect(service.get(key)).toBe(TEXT_DEFAULT)
    expect(service.get(key)).toBe(TEXT_DEFAULT)
    expect(read).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('is given again without reading the port again when the check throws', () => {
    const parse = vi.fn((): string | undefined => {
      throw new Error('the stored value cannot be read')
    })
    const { port, read, service } = serviceWithSpiedPort()
    port.write(TEXT_NAME, 'stored')
    read.mockClear()
    const key = textKeyWith(parse)

    expect(service.get(key)).toBe(TEXT_DEFAULT)
    expect(service.get(key)).toBe(TEXT_DEFAULT)
    expect(read).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('is replaced by a valid value that is set afterward', () => {
    const { port, service } = serviceWithSpiedPort()
    port.write(TEXT_NAME, 42)
    const key = textKeyWith(parseText)
    expect(service.get(key)).toBe(TEXT_DEFAULT)

    service.set(key, 'fresh')

    expect(port.read(TEXT_NAME)).toBe('fresh')
    expect(service.get(key)).toBe('fresh')
  })
})

describe('two key objects with the same name', () => {
  it('give the value that the other one set, with no new read of the port', () => {
    const { read, service } = serviceWithSpiedPort()
    const writer = textKeyWith(parseText)
    const reader = textKeyWith(parseText)
    expect(service.get(reader)).toBe(TEXT_DEFAULT)

    service.set(writer, 'shared')
    read.mockClear()

    expect(service.get(reader)).toBe('shared')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('a name whose subscribers have all ended', () => {
  it('calls no listener and throws nothing at the next set', () => {
    const { service } = serviceWithSpiedPort()
    const key = textKeyWith(parseText)
    const first = vi.fn()
    const second = vi.fn()
    const endFirst = service.subscribe(key, first)
    const endSecond = service.subscribe(key, second)
    endFirst()
    endSecond()

    expect(() => service.set(key, 'quiet')).not.toThrow()

    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it('calls a subscriber that is added afterward at the next set', () => {
    const { service } = serviceWithSpiedPort()
    const key = textKeyWith(parseText)
    service.subscribe(key, vi.fn())()
    const later = vi.fn()

    service.subscribe(key, later)
    service.set(key, 'heard')

    expect(later).toHaveBeenCalledExactlyOnceWith('heard')
  })
})
