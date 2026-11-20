import { describe, expect, it } from 'vitest'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { VERSION_FIXTURE_VERSIONS } from '../../tests/fixtures/projects/versions'
import { CURRENT_SCHEMA_VERSION } from '../index'
import { bestEffortProjectName, readStoredFacts } from './best-effort-read'

const OLDEST_FIXTURE_VERSION = 8
const INVALID_UTF8_BYTES = new Uint8Array([0xff, 0xfe, 0x7b, 0xc3, 0x28])

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

function nameOf(document: Json): string {
  return (document.meta as { name: string }).name
}

describe('reading the name of a stored project without decoding it', () => {
  it('returns the name of a document at the current version', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a version 8 document without migrating it', () => {
    const document = fixtureDocument(OLDEST_FIXTURE_VERSION)

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a document at a version above the build', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a document that breaks the format rules', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    document.unknownTopLevelField = 1

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })
})

describe('reading the name of bytes that hold no readable name', () => {
  it.each([
    { name: 'bytes that are not JSON', text: '{ this is not json' },
    { name: 'an empty array', text: '[]' },
    { name: 'null', text: 'null' },
    { name: 'an empty object', text: '{}' },
    { name: 'a meta that is not an object', text: '{"meta":"House"}' },
    { name: 'a meta that is null', text: '{"meta":null}' },
    { name: 'a meta with no name', text: '{"meta":{}}' },
    { name: 'a name that is a number', text: '{"meta":{"name":7}}' },
    { name: 'a name that is null', text: '{"meta":{"name":null}}' },
  ])('returns undefined for $name', ({ text }) => {
    expect(bestEffortProjectName(encode(text))).toBeUndefined()
  })

  it('does not throw for bytes that are not valid UTF-8', () => {
    expect(() => bestEffortProjectName(INVALID_UTF8_BYTES)).not.toThrow()
    expect(bestEffortProjectName(INVALID_UTF8_BYTES)).toBeUndefined()
  })
})

const NOT_A_STRING = 7

const furnitureWith = (contentHash: unknown, scope = 'user'): Json => ({
  assetRef: { scope, contentHash },
})

const underlayWith = (source: Json): Json => ({ source })

const documentOf = (floors: unknown, name: unknown = 'House'): Json => ({ meta: { name }, floors })

const floorOf = (furniture: unknown[], underlays: unknown[] = []): Json => ({
  furniture,
  underlays,
})

const factsOf = (document: unknown) => readStoredFacts(bytesOf(document))

function contentHashesIn(document: Json): string[] {
  const text = JSON.stringify(document)
  const found = [...text.matchAll(/"contentHash":"([^"]+)"/g)].map((match) => match[1] as string)
  return [...new Set(found)].sort()
}

describe('reading the facts of bytes that hold none', () => {
  it('gives no name and no hashes for bytes that are not JSON', () => {
    const facts = readStoredFacts(encode('{ this is not json'))

    expect(facts).toEqual({ assetHashes: [] })
    expect(facts).not.toHaveProperty('name')
  })

  it.each([
    { name: 'bytes that are not UTF-8', bytes: INVALID_UTF8_BYTES },
    { name: 'no bytes at all', bytes: new Uint8Array() },
    { name: 'null', bytes: encode('null') },
    { name: 'an array', bytes: encode('[1,2]') },
    { name: 'a number', bytes: encode('42') },
    { name: 'a string', bytes: encode('"House"') },
    { name: 'an empty object', bytes: encode('{}') },
  ])('does not throw for $name and gives no name and no hashes', ({ bytes }) => {
    expect(() => readStoredFacts(bytes)).not.toThrow()
    expect(readStoredFacts(bytes)).toEqual({ assetHashes: [] })
    expect(readStoredFacts(bytes)).not.toHaveProperty('name')
  })

  it('gives no name for a name that is not a string, and keeps the hashes', () => {
    const floors = [floorOf([furnitureWith('hash-kept')])]

    for (const name of [NOT_A_STRING, null, { first: 'House' }, ['House']]) {
      const facts = factsOf(documentOf(floors, name))

      expect(facts).toEqual({ assetHashes: ['hash-kept'] })
      expect(facts).not.toHaveProperty('name')
    }
  })
})

describe('reading the name and the asset hashes of a stored project', () => {
  it('gives the name and the hashes of the furniture and the underlays of a document that fails the check', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    document.unknownTopLevelField = 1

    const facts = factsOf(document)

    expect(facts.name).toBe(nameOf(document))
    expect(facts.assetHashes).toEqual(contentHashesIn(document))
    expect(facts.assetHashes.length).toBeGreaterThan(0)
  })

  it('gives the name and the hashes of a document at a version above the build', () => {
    const document = documentOf([floorOf([furnitureWith('hash-furniture')], [])], 'Future house')
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
    document.fieldOfALaterBuild = { anything: true }

    expect(factsOf(document)).toEqual({ name: 'Future house', assetHashes: ['hash-furniture'] })
  })

  it('lists a hash that several items share once, and sorts the list by code unit', () => {
    const document = documentOf([
      floorOf([furnitureWith('b2'), furnitureWith('B1'), furnitureWith('b2')]),
      floorOf(
        [furnitureWith('a3'), furnitureWith('B1')],
        [underlayWith({ kind: 'raster', image: { scope: 'project', contentHash: 'a3' } })],
      ),
    ])

    expect(factsOf(document).assetHashes).toEqual(['B1', 'a3', 'b2'])
  })

  it('skips a part with another shape and keeps the hashes around it', () => {
    const document = documentOf([
      'not a floor',
      null,
      { furniture: 'not a list', underlays: { not: 'a list' } },
      floorOf(
        [
          furnitureWith('hash-before'),
          {},
          null,
          'not an item',
          { assetRef: null },
          { assetRef: 'not an object' },
          furnitureWith(NOT_A_STRING),
          furnitureWith(null),
          furnitureWith('hash-after'),
        ],
        [
          underlayWith({}),
          { source: null },
          'not an underlay',
          underlayWith({ kind: 'raster', image: { contentHash: NOT_A_STRING } }),
          underlayWith({ kind: 'raster', image: null }),
          underlayWith({ kind: 'raster', image: { scope: 'project', contentHash: 'hash-image' } }),
        ],
      ),
    ])

    expect(factsOf(document)).toEqual({
      name: 'House',
      assetHashes: ['hash-after', 'hash-before', 'hash-image'],
    })
    expect(factsOf(documentOf({ furniture: [furnitureWith('hash-lost')] }))).toEqual({
      name: 'House',
      assetHashes: [],
    })
  })

  it('reads the three kinds of underlay source, whatever the kind field says', () => {
    const reference = (contentHash: string) => ({ scope: 'user', contentHash })
    const document = documentOf([
      floorOf(
        [],
        [
          underlayWith({ kind: 'scene', image: reference('hash-image') }),
          underlayWith({ kind: 'raster', document: reference('hash-document'), page: 1 }),
          underlayWith({ kind: 'document', scene: reference('hash-scene') }),
          underlayWith({ kind: 'unknown-kind', image: reference('hash-other-image') }),
          underlayWith({ image: reference('hash-no-kind') }),
        ],
      ),
    ])

    expect(factsOf(document).assetHashes).toEqual([
      'hash-document',
      'hash-image',
      'hash-no-kind',
      'hash-other-image',
      'hash-scene',
    ])
  })

  it('lists the hash of a pack asset like any other', () => {
    const document = documentOf([
      floorOf([
        furnitureWith('hash-pack', 'pack:vernacular-starter@1.0.0'),
        furnitureWith('hash-user', 'user'),
        furnitureWith('hash-project', 'project'),
      ]),
    ])

    expect(factsOf(document).assetHashes).toEqual(['hash-pack', 'hash-project', 'hash-user'])
  })
})

describe('the name that a best-effort read gives', () => {
  it.each(VERSION_FIXTURE_VERSIONS)(
    'is the name that bestEffortProjectName gives for the version %i fixture',
    (version) => {
      const bytes = bytesOf(fixtureDocument(version))
      const expected = bestEffortProjectName(bytes)

      expect(expected).toBeDefined()
      expect(readStoredFacts(bytes).name).toBe(expected)
    },
  )
})
