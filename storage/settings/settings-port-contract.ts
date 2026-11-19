import { describe, expect, it } from 'vitest'
import type { SettingsPort } from './settings-port'

/**
 * Reusable behavioral contract for any {@link SettingsPort} implementation.
 *
 * Call this once from a test file, passing a factory that returns a fresh, empty port. Each
 * assertion runs against its own port from `makeEmpty()`, so the suites stay independent.
 *
 * @param label - Human-readable name of the implementation under test, used as the `describe`
 *   block title.
 * @param makeEmpty - Builds a fresh, empty port for a single assertion.
 */
export function assertSettingsPortContract(label: string, makeEmpty: () => SettingsPort): void {
  describe(`${label} satisfies the SettingsPort contract`, () => {
    describeReadsAndWrites(makeEmpty)
    describeRemoval(makeEmpty)
    describeIsolation(makeEmpty)
  })
}

const JSON_VALUES: readonly unknown[] = [
  'a text',
  42,
  true,
  false,
  null,
  [1, 'two', [3]],
  { outer: { inner: [1, { deep: 'yes' }] }, flag: false },
]

function describeReadsAndWrites(makeEmpty: () => SettingsPort): void {
  it('reads undefined for a name that was never written', () => {
    const port = makeEmpty()

    expect(port.read('never-written')).toBeUndefined()
  })

  it('reads back each kind of JSON value after a write', () => {
    const port = makeEmpty()

    JSON_VALUES.forEach((value, index) => {
      port.write(`value-${index}`, value)
    })

    JSON_VALUES.forEach((value, index) => {
      expect(port.read(`value-${index}`)).toStrictEqual(value)
    })
  })

  it('replaces the value on a second write', () => {
    const port = makeEmpty()

    port.write('name', 'first')
    port.write('name', { second: true })

    expect(port.read('name')).toStrictEqual({ second: true })
  })

  it('keeps two names apart', () => {
    const port = makeEmpty()

    port.write('one', 1)
    expect(port.read('two')).toBeUndefined()
    port.write('two', 2)
    port.write('two', 'changed')

    expect(port.read('one')).toBe(1)
    expect(port.read('two')).toBe('changed')
  })

  it('drops a member whose value is undefined', () => {
    const port = makeEmpty()

    port.write('name', { kept: 1, dropped: undefined })

    expect(port.read('name')).toStrictEqual({ kept: 1 })
  })
}

function describeRemoval(makeEmpty: () => SettingsPort): void {
  it('removes the setting when undefined is written', () => {
    const port = makeEmpty()
    port.write('name', 'stored')

    port.write('name', undefined)

    expect(port.read('name')).toBeUndefined()
  })

  it('removes the setting when a function is written', () => {
    const port = makeEmpty()
    port.write('name', 'stored')

    port.write('name', () => 'not JSON')

    expect(port.read('name')).toBeUndefined()
  })
}

function describeIsolation(makeEmpty: () => SettingsPort): void {
  it('does not follow a change made to a value after its write', () => {
    const port = makeEmpty()
    const written = { list: [1] }
    port.write('name', written)

    written.list.push(2)

    expect(port.read('name')).toStrictEqual({ list: [1] })
  })

  it('does not follow a change made to a value that was read', () => {
    const port = makeEmpty()
    port.write('name', { list: [1] })
    const read = port.read('name') as { list: number[] }

    read.list.push(2)

    expect(port.read('name')).toStrictEqual({ list: [1] })
  })

  it('passes on the TypeError for a value with a cycle and keeps the earlier value', () => {
    const port = makeEmpty()
    port.write('name', 'earlier')
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic

    expect(() => {
      port.write('name', cyclic)
    }).toThrow(TypeError)

    expect(port.read('name')).toBe('earlier')
  })
}
