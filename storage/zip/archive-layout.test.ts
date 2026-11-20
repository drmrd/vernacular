import { describe, expect, it } from 'vitest'
import { assetEntryName, assetHashOfEntry, isContentHash } from './archive-layout'
import {
  NAMES_LIKE_AN_ASSET,
  NAMES_LIKE_THE_DOCUMENT,
  NAMES_OUTSIDE_THE_LAYOUT,
} from './archive-names-test-kit'

/** 64 lower-case hexadecimal digits, with every digit and every letter in it. */
const HASH = '0123456789abcdef'.repeat(4)
/** The SHA-256 of no bytes. */
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const DOCUMENT_NAME = 'vernacular.json'

describe('isContentHash', () => {
  it.each([
    ['every hexadecimal digit', HASH],
    ['the hash of no bytes', EMPTY_HASH],
    ['only zeros', '0'.repeat(HASH.length)],
  ])('accepts 64 lower-case hexadecimal digits: %s', (_case, value) => {
    expect(isContentHash(value)).toBe(true)
  })

  it.each([
    ['63 digits', HASH.slice(0, -1)],
    ['65 digits', `${HASH}0`],
    ['upper case', HASH.toUpperCase()],
    ['one upper-case digit', `A${HASH.slice(1)}`],
    ['another letter', `g${HASH.slice(1)}`],
    ['the empty string', ''],
    ['a value with a slash', `${HASH.slice(0, -1)}/`],
    ['a slash before the digits', `/${HASH}`],
    ['a fullwidth digit', `０${HASH.slice(1)}`],
    ['a fullwidth letter', `ａ${HASH.slice(1)}`],
    ['a line break at the end', `${HASH}\n`],
    ['a line break in place of the last digit', `${HASH.slice(0, -1)}\n`],
    ['a NUL at the end', `${HASH}\u0000`],
    ['a NUL in place of the first digit', `\u0000${HASH.slice(1)}`],
    ['a space at the end', `${HASH} `],
  ])('refuses %s', (_case, value) => {
    expect(isContentHash(value)).toBe(false)
  })
})

describe('assetEntryName and assetHashOfEntry', () => {
  it('names an asset entry assets/ and its hash', () => {
    expect(assetEntryName(HASH)).toBe(`assets/${HASH}`)
  })

  it.each([HASH, EMPTY_HASH])(
    'assetHashOfEntry gives back the hash that assetEntryName named: %s',
    (hash) => {
      expect(assetHashOfEntry(assetEntryName(hash))).toBe(hash)
      expect(assetHashOfEntry(`assets/${hash}`)).toBe(hash)
    },
  )

  it.each(NAMES_LIKE_AN_ASSET)(
    'assetHashOfEntry gives undefined for a name with %s',
    (_case, nameOf) => {
      expect(assetHashOfEntry(nameOf(HASH))).toBeUndefined()
    },
  )

  it.each([...NAMES_OUTSIDE_THE_LAYOUT, ...NAMES_LIKE_THE_DOCUMENT, DOCUMENT_NAME, ''])(
    'assetHashOfEntry gives undefined for the name %j',
    (name) => {
      expect(assetHashOfEntry(name)).toBeUndefined()
    },
  )
})
