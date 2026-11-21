import { describe, expect, it } from 'vitest'
import { addressFor, parseAddress, type Place } from './address'

const START: Place = { kind: 'start' }
const UUID = '3f2b8c1e-9a4d-4e57-8b1a-6c0d5e7f9a21'

describe('parseAddress', () => {
  it('reads the empty fragment, a lone hash, and a hash with a slash as the start', () => {
    expect(parseAddress('')).toStrictEqual(START)
    expect(parseAddress('#')).toStrictEqual(START)
    expect(parseAddress('#/')).toStrictEqual(START)
  })

  it('reads the projects address as the page', () => {
    expect(parseAddress('#/projects')).toStrictEqual({ kind: 'projects' })
  })

  it('reads the address of the project named current as that project', () => {
    expect(parseAddress('#/project/current')).toStrictEqual({
      kind: 'project',
      id: 'current',
    })
  })

  it('reads the address of a project with a random id as that project', () => {
    expect(parseAddress(`#/project/${UUID}`)).toStrictEqual({
      kind: 'project',
      id: UUID,
    })
  })

  it('gives every project place back after its address is parsed', () => {
    const places: readonly Place[] = [
      { kind: 'project', id: 'current' },
      { kind: 'project', id: UUID },
      { kind: 'project', id: 'a' },
      { kind: 'project', id: '7' },
      { kind: 'project', id: 'Kitchen-2' },
    ]

    for (const place of places) {
      expect(parseAddress(addressFor(place))).toStrictEqual(place)
    }
  })

  it('reads a project address with dots and a slash as the start', () => {
    expect(parseAddress('#/project/../x')).toStrictEqual(START)
    expect(parseAddress('#/project/..')).toStrictEqual(START)
    expect(parseAddress('#/project/./x')).toStrictEqual(START)
  })

  it('reads a project address with no id as the start', () => {
    expect(parseAddress('#/project/')).toStrictEqual(START)
    expect(parseAddress('#/project')).toStrictEqual(START)
  })

  it('reads a project address with an id of 200 characters as the start', () => {
    expect(parseAddress(`#/project/${'a'.repeat(200)}`)).toStrictEqual(START)
  })

  it('reads a project address with a percent-encoded slash as the start', () => {
    expect(parseAddress('#/project/a%2Fb')).toStrictEqual(START)
    expect(parseAddress('#/project/%2F')).toStrictEqual(START)
    expect(parseAddress('#/project/%63urrent')).toStrictEqual(START)
  })

  it('reads a project address with a second path part as the start', () => {
    expect(parseAddress('#/project/a/b')).toStrictEqual(START)
    expect(parseAddress('#/project/current/projects')).toStrictEqual(START)
  })

  it('accepts an id of 64 characters and reads one of 65 as the start', () => {
    const longest = 'a'.repeat(64)

    expect(parseAddress(`#/project/${longest}`)).toStrictEqual({
      kind: 'project',
      id: longest,
    })
    expect(parseAddress(`#/project/${longest}a`)).toStrictEqual(START)
  })

  it('reads a trailing slash, a tail after the id, and another letter case as the start', () => {
    expect(parseAddress('#/projects/')).toStrictEqual(START)
    expect(parseAddress('#/project/abc/')).toStrictEqual(START)
    expect(parseAddress('#/projects?x=1')).toStrictEqual(START)
    expect(parseAddress('#/project/abc?x')).toStrictEqual(START)
    expect(parseAddress('#/project/abc#x')).toStrictEqual(START)
    expect(parseAddress('#/Projects')).toStrictEqual(START)
    expect(parseAddress('#/PROJECT/abc')).toStrictEqual(START)
  })

  it('reads white space and a missing leading slash as the start', () => {
    expect(parseAddress('#/project/a b')).toStrictEqual(START)
    expect(parseAddress('#/project/ abc')).toStrictEqual(START)
    expect(parseAddress('#/project/abc ')).toStrictEqual(START)
    expect(parseAddress('#/project/abc\n')).toStrictEqual(START)
    expect(parseAddress('#/projects ')).toStrictEqual(START)
    expect(parseAddress(' #/projects')).toStrictEqual(START)
    expect(parseAddress('#projects')).toStrictEqual(START)
    expect(parseAddress('#project/abc')).toStrictEqual(START)
    expect(parseAddress('/projects')).toStrictEqual(START)
  })

  it('reads an address that starts with a dash as the start', () => {
    expect(parseAddress('#/project/-abc')).toStrictEqual(START)
  })

  it('returns a new object that holds only the kind and the id', () => {
    const first = parseAddress('#/project/current')
    const second = parseAddress('#/project/current')

    expect(Object.keys(first).sort()).toEqual(['id', 'kind'])
    expect(Object.keys(parseAddress('#/projects'))).toEqual(['kind'])
    expect(Object.keys(parseAddress(''))).toEqual(['kind'])
    expect(second).not.toBe(first)
    expect(parseAddress('')).not.toBe(parseAddress(''))
  })

  it('never throws on a lone surrogate, a NUL character, or a very long text', () => {
    const hostile = [
      '#/project/\ud800',
      '#/project/a\udc00b',
      '\ud800',
      '#/project/a\u0000b',
      '\u0000',
      `#/project/${'a'.repeat(1_000_000)}`,
      `#/${'/'.repeat(1_000_000)}`,
    ]

    for (const hash of hostile) {
      expect(() => parseAddress(hash)).not.toThrow()
      expect(parseAddress(hash)).toStrictEqual(START)
    }
  })

  it('keeps the letter case of an id', () => {
    expect(parseAddress('#/project/AbC-123')).toStrictEqual({
      kind: 'project',
      id: 'AbC-123',
    })
    expect(parseAddress('#/project/CURRENT')).toStrictEqual({
      kind: 'project',
      id: 'CURRENT',
    })
  })
})

describe('addressFor', () => {
  it('gives the start address for a project place whose id is not valid', () => {
    const invalidIds = ['', '..', '../x', 'a/b', 'a%2Fb', 'a b', '-abc', 'a'.repeat(65)]

    for (const id of invalidIds) {
      expect(addressFor({ kind: 'project', id })).toBe('')
    }
  })

  it('never changes the path or the query of the page', () => {
    const bases = [
      'https://vernacular.example',
      'https://vernacular.example/app/',
      'https://vernacular.example/app/?fixture=scene-harness',
      'https://vernacular.example/?e2e-storage',
      'https://vernacular.example/app/index.html?fixture=scene-harness&e2e-storage',
    ]
    const places: readonly Place[] = [
      START,
      { kind: 'projects' },
      { kind: 'project', id: 'current' },
    ]

    for (const base of bases) {
      const page = new URL(base)

      for (const place of places) {
        const resolved = new URL(addressFor(place), base)

        expect(resolved.pathname).toBe(page.pathname)
        expect(resolved.search).toBe(page.search)
      }
    }
  })
})
