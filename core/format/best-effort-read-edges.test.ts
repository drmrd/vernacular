import { describe, expect, it } from 'vitest'
import { bytesOf, fixtureDocument } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  VERSION_FIXTURE_VERSIONS,
  versionFixtureBytes,
} from '../../tests/fixtures/projects/versions'
import { bestEffortProjectName, readStoredFacts } from './best-effort-read'

const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf]
const NESTING_DEPTH = 2000

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const furnitureText = (contentHash: string): string =>
  `{"assetRef":{"scope":"user","contentHash":"${contentHash}"}}`

const documentText = (name: string, floors: string[]): string =>
  `{"meta":{"name":"${name}"},"floors":[${floors.join(',')}]}`

const floorText = (furniture: string[]): string => `{"furniture":[${furniture.join(',')}]}`

function withByteOrderMark(bytes: Uint8Array): Uint8Array {
  return new Uint8Array([...BYTE_ORDER_MARK, ...bytes])
}

/** Every string value of a key named `contentHash`, at any depth, with its JSON path. */
function contentHashesIn(value: unknown, path = ''): { path: string; hash: string }[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const here = `${path}/${key}`
    if (key === 'contentHash' && typeof child === 'string') return [{ path: here, hash: child }]
    return contentHashesIn(child, here)
  })
}

const sortedOnce = (hashes: string[]): string[] => [...new Set(hashes)].sort()

describe('the asset hashes of a stored project at each published version', () => {
  it.each(VERSION_FIXTURE_VERSIONS)(
    'lists every contentHash that the version %i fixture holds, each once and sorted',
    (version) => {
      const found = contentHashesIn(fixtureDocument(version))

      expect(readStoredFacts(versionFixtureBytes(version)).assetHashes).toEqual(
        sortedOnce(found.map((entry) => entry.hash)),
      )
    },
  )
})

describe('the facts of a stored project with empty strings', () => {
  it('lists a contentHash that is the empty string, as every string counts', () => {
    const bytes = encode(
      documentText('House', [floorText([furnitureText(''), furnitureText('a1')])]),
    )

    expect(readStoredFacts(bytes).assetHashes).toEqual(['', 'a1'])
  })

  it('gives an empty name as it is, equal to the name that bestEffortProjectName gives', () => {
    const bytes = encode(documentText('', [floorText([furnitureText('a1')])]))

    expect(readStoredFacts(bytes)).toEqual({ name: '', assetHashes: ['a1'] })
    expect(readStoredFacts(bytes).name).toBe(bestEffortProjectName(bytes))
  })
})

describe('the facts of stored bytes that start with a UTF-8 byte order mark', () => {
  it('gives the same facts as the bytes without the mark', () => {
    const bytes = encode(documentText('House', [floorText([furnitureText('a1')])]))

    expect(readStoredFacts(withByteOrderMark(bytes))).toEqual(readStoredFacts(bytes))
    expect(readStoredFacts(withByteOrderMark(bytes))).toEqual({
      name: 'House',
      assetHashes: ['a1'],
    })
  })
})

describe('the facts of a stored project with odd values', () => {
  it('keeps the name and the hashes when the root and an item hold a __proto__ key', () => {
    const item = `{"__proto__":{"assetRef":{"contentHash":"poison"}},"assetRef":{"contentHash":"a1"}}`
    const bytes = encode(
      `{"__proto__":{"floors":[${floorText([furnitureText('poison')])}]},` +
        `"meta":{"name":"House"},"floors":[${floorText([item, furnitureText('b2')])}]}`,
    )

    expect(() => readStoredFacts(bytes)).not.toThrow()
    expect(readStoredFacts(bytes)).toEqual({ name: 'House', assetHashes: ['a1', 'b2'] })
  })

  it('keeps the hashes when a member that the read does not use is nested very deeply', () => {
    const deep = '['.repeat(NESTING_DEPTH) + ']'.repeat(NESTING_DEPTH)
    const bytes = encode(
      `{"meta":{"name":"House"},"unused":${deep},"floors":[${floorText([furnitureText('a1')])}]}`,
    )

    expect(() => readStoredFacts(bytes)).not.toThrow()
    expect(readStoredFacts(bytes)).toEqual({ name: 'House', assetHashes: ['a1'] })
  })

  it('keeps the hashes of the floors on both sides of a floor that is null', () => {
    const floors = [floorText([furnitureText('a1')]), 'null', floorText([furnitureText('b2')])]
    const bytes = encode(documentText('House', floors))

    expect(readStoredFacts(bytes)).toEqual({ name: 'House', assetHashes: ['a1', 'b2'] })
  })
})

describe('reading the facts of stored bytes', () => {
  it('leaves the bytes that it reads unchanged', () => {
    const bytes = bytesOf(fixtureDocument(VERSION_FIXTURE_VERSIONS.at(-1) as number))
    const before = bytes.slice()

    readStoredFacts(bytes)

    expect(bytes).toEqual(before)
  })
})
