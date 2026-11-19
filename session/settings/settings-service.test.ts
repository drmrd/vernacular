import { describe, expect, it, vi } from 'vitest'
import { InMemorySettingsPort } from '../../storage'
import type { SettingsPort } from '../../storage'
import { createSettingsService } from './settings-service'
import type { SettingKey } from './settings-service'

const TEXT_NAME = 'text'
const SHAPE_NAME = 'shape'
const TEXT_DEFAULT = 'fallback'

interface Shape {
  readonly size: number
}

const SHAPE_DEFAULT: Shape = { size: 0 }

function parseText(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/** Builds a new object from the stored one, so a stored shape is never the object that get gives. */
function parseShape(raw: unknown): Shape | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const size = (raw as { size?: unknown }).size
  return typeof size === 'number' ? { size } : undefined
}

function textKeyWith(parse: (raw: unknown) => string | undefined, name = TEXT_NAME) {
  const key: SettingKey<string> = { name, defaultValue: TEXT_DEFAULT, parse }
  return key
}

const textKey = textKeyWith(parseText)
const shapeKey: SettingKey<Shape> = {
  name: SHAPE_NAME,
  defaultValue: SHAPE_DEFAULT,
  parse: parseShape,
}

function recorder(calls: string[], label: string): (value: string) => void {
  return (value) => {
    calls.push(`${label}:${value}`)
  }
}

function thrownBy(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  return undefined
}

function serviceOver(port: SettingsPort = new InMemorySettingsPort()) {
  return { port, service: createSettingsService(port) }
}

describe('reading a setting', () => {
  it('gives the default when nothing is stored', () => {
    const parse = vi.fn(parseText)
    const { service } = serviceOver()

    expect(service.get(textKeyWith(parse))).toBe(TEXT_DEFAULT)
    expect(service.get(shapeKey)).toBe(SHAPE_DEFAULT)
    expect(parse).not.toHaveBeenCalled()
  })

  it('gives the stored value when it passes the check', () => {
    const parse = vi.fn(parseText)
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 'stored')
    port.write(SHAPE_NAME, { size: 3 })

    expect(service.get(textKeyWith(parse))).toBe('stored')
    expect(parse).toHaveBeenCalledExactlyOnceWith('stored')
    expect(service.get(shapeKey)).toEqual({ size: 3 })
  })

  it('gives the default when the stored value fails the check, and leaves it stored', () => {
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 42)

    expect(service.get(textKey)).toBe(TEXT_DEFAULT)
    expect(port.read(TEXT_NAME)).toBe(42)
  })

  it('gives the default when the check throws', () => {
    const parse = vi.fn((): string | undefined => {
      throw new Error('the stored value cannot be read')
    })
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 'stored')

    expect(service.get(textKeyWith(parse))).toBe(TEXT_DEFAULT)
    expect(parse).toHaveBeenCalled()
  })

  it('hands a stored null to the check', () => {
    const parse = vi.fn((raw: unknown) => (raw === null ? 'was null' : undefined))
    const port: SettingsPort = { read: () => null, write: vi.fn() }

    expect(createSettingsService(port).get(textKeyWith(parse))).toBe('was null')
    expect(parse).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('reads the port once for each name', () => {
    const { port, service } = serviceOver()
    port.write(SHAPE_NAME, { size: 3 })
    const read = vi.spyOn(port, 'read')

    service.get(textKey)
    service.get(textKey)
    service.get(shapeKey)
    service.get(textKey)
    service.get(shapeKey)

    expect(read.mock.calls).toEqual([[TEXT_NAME], [SHAPE_NAME]])
  })

  it('keeps what the first get gave, even when the port changes behind the service', () => {
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 'first')
    const first = service.get(textKey)

    port.write(TEXT_NAME, 'changed behind the service')

    expect(first).toBe('first')
    expect(service.get(textKey)).toBe('first')
  })

  it('gives the same object on every get until a set', () => {
    const { port, service } = serviceOver()
    port.write(SHAPE_NAME, { size: 3 })
    const first = service.get(shapeKey)

    expect(service.get(shapeKey)).toBe(first)
    expect(service.get(shapeKey)).toBe(first)

    const replacement: Shape = { size: 5 }
    service.set(shapeKey, replacement)

    expect(service.get(shapeKey)).toBe(replacement)
    expect(service.get(shapeKey)).toBe(replacement)
  })

  it('a get writes nothing', () => {
    const { port, service } = serviceOver()
    port.write('broken', 42)
    const write = vi.spyOn(port, 'write')

    service.get(textKey)
    service.get(shapeKey)
    service.get(textKeyWith(parseText, 'broken'))

    expect(write).not.toHaveBeenCalled()
  })
})

describe('writing a setting', () => {
  it('gives the value of a set and stores it in the port', () => {
    const { port, service } = serviceOver()
    const write = vi.spyOn(port, 'write')
    const shape: Shape = { size: 7 }

    service.set(textKey, 'new')
    service.set(shapeKey, shape)

    expect(service.get(textKey)).toBe('new')
    expect(service.get(shapeKey)).toBe(shape)
    expect(write.mock.calls).toEqual([
      [TEXT_NAME, 'new'],
      [SHAPE_NAME, shape],
    ])
    expect(port.read(TEXT_NAME)).toBe('new')
    expect(port.read(SHAPE_NAME)).toEqual({ size: 7 })
  })

  it('the port holds the value before a subscriber is called', () => {
    const { port, service } = serviceOver()
    const seen: unknown[] = []
    service.subscribe(textKey, () => {
      seen.push(port.read(TEXT_NAME), service.get(textKey))
    })

    service.set(textKey, 'new')

    expect(seen).toEqual(['new', 'new'])
  })

  it('a write that throws changes nothing and passes the error on', () => {
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 'before')
    const calls: string[] = []
    service.subscribe(textKey, recorder(calls, 'listener'))
    expect(service.get(textKey)).toBe('before')
    const failure = new Error('the storage is full')
    const write = vi.spyOn(port, 'write').mockImplementation(() => {
      throw failure
    })

    expect(thrownBy(() => service.set(textKey, 'after'))).toBe(failure)

    expect(service.get(textKey)).toBe('before')
    expect(calls).toEqual([])
    write.mockRestore()
    expect(port.read(TEXT_NAME)).toBe('before')
  })
})

describe('change notification', () => {
  it('a set notifies each subscriber of that key once, with the value, in the order they came', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    service.subscribe(textKey, recorder(calls, 'first'))
    service.subscribe(textKey, recorder(calls, 'second'))
    service.subscribe(textKey, recorder(calls, 'third'))

    service.set(textKey, 'new')

    expect(calls).toEqual(['first:new', 'second:new', 'third:new'])
  })

  it('a set of another key notifies no subscriber of this key', () => {
    const { service } = serviceOver()
    const textCalls: string[] = []
    const shapeCalls: Shape[] = []
    service.subscribe(textKey, recorder(textCalls, 'text'))
    service.subscribe(shapeKey, (value) => shapeCalls.push(value))
    const shape: Shape = { size: 4 }

    service.set(shapeKey, shape)

    expect(textCalls).toEqual([])
    expect(shapeCalls).toEqual([shape])
  })

  it('a set of an equal value still notifies', () => {
    const { port, service } = serviceOver()
    port.write(TEXT_NAME, 'same')
    expect(service.get(textKey)).toBe('same')
    const calls: string[] = []
    service.subscribe(textKey, recorder(calls, 'listener'))

    service.set(textKey, 'same')
    service.set(textKey, 'same')

    expect(calls).toEqual(['listener:same', 'listener:same'])
  })

  it('an unsubscribed listener is not called, and ending twice does no harm', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    const endFirst = service.subscribe(textKey, recorder(calls, 'first'))
    service.subscribe(textKey, recorder(calls, 'second'))

    endFirst()
    endFirst()
    service.set(textKey, 'new')

    expect(calls).toEqual(['second:new'])
  })

  it('one function subscribed twice is called twice, and each subscription ends alone', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    const listener = recorder(calls, 'listener')
    const endFirst = service.subscribe(textKey, listener)
    const endSecond = service.subscribe(textKey, listener)

    service.set(textKey, 'a')
    expect(calls).toHaveLength(2)

    endFirst()
    endFirst()
    service.set(textKey, 'b')
    expect(calls).toHaveLength(3)

    endSecond()
    service.set(textKey, 'c')
    expect(calls).toHaveLength(3)
  })
})

describe('change during a notification', () => {
  it('a listener that ends its own subscription does not stop the others', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    const endFirst = service.subscribe(textKey, (value) => {
      calls.push(`first:${value}`)
      endFirst()
    })
    service.subscribe(textKey, recorder(calls, 'second'))
    service.subscribe(textKey, recorder(calls, 'third'))

    service.set(textKey, 'one')
    service.set(textKey, 'two')

    expect(calls).toEqual(['first:one', 'second:one', 'third:one', 'second:two', 'third:two'])
  })

  it('a listener ended by an earlier listener of the same round is not called in that round', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    let endSecond = (): void => undefined
    service.subscribe(textKey, (value) => {
      calls.push(`first:${value}`)
      endSecond()
    })
    endSecond = service.subscribe(textKey, recorder(calls, 'second'))
    service.subscribe(textKey, recorder(calls, 'third'))

    service.set(textKey, 'one')

    expect(calls).toEqual(['first:one', 'third:one'])
  })

  it('a listener added during a notification is first called at the next set', () => {
    const { service } = serviceOver()
    const calls: string[] = []
    let added = false
    service.subscribe(textKey, (value) => {
      calls.push(`early:${value}`)
      if (!added) {
        added = true
        service.subscribe(textKey, recorder(calls, 'late'))
      }
    })

    service.set(textKey, 'one')
    expect(calls).toEqual(['early:one'])

    service.set(textKey, 'two')
    expect(calls).toEqual(['early:one', 'early:two', 'late:two'])
  })
})

describe('names and ports', () => {
  it('two key objects with one name are one setting', () => {
    const { port, service } = serviceOver()
    const first = textKeyWith(parseText, 'shared')
    const second = textKeyWith(parseText, 'shared')
    port.write('shared', 'stored')
    const read = vi.spyOn(port, 'read')
    const calls: string[] = []
    service.subscribe(second, recorder(calls, 'second'))

    expect(service.get(first)).toBe('stored')
    expect(service.get(second)).toBe('stored')
    expect(read).toHaveBeenCalledTimes(1)

    service.set(first, 'new')

    expect(calls).toEqual(['second:new'])
    expect(service.get(first)).toBe('new')
    expect(service.get(second)).toBe('new')
  })

  it('a service with no port keeps values in memory, and two such services share nothing', () => {
    const first = createSettingsService()
    const second = createSettingsService()
    const calls: string[] = []
    second.subscribe(textKey, recorder(calls, 'second'))

    first.set(textKey, 'in the first')

    expect(first.get(textKey)).toBe('in the first')
    expect(second.get(textKey)).toBe(TEXT_DEFAULT)
    expect(calls).toEqual([])
  })
})
