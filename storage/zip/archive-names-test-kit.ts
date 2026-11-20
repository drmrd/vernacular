/**
 * Test support for the names of an archive: names that look like the document or
 * like an asset and are neither. Each name is written as it is, so a test of the
 * reader and a test of the name rules check the same list. Production code does
 * not import it.
 */

/** The distance from an ASCII character to its fullwidth form (U+FF01 to U+FF5E). */
const FULLWIDTH_OFFSET = 0xfee0
const BYTE_ORDER_MARK = '﻿'
const LONG_S = 'ſ'
const ASSET_FOLDER = 'assets/'

/** Six names outside the layout that a hostile archive might use: none is the document, and none is an asset. */
export const NAMES_OUTSIDE_THE_LAYOUT: readonly string[] = [
  '../x',
  '/etc/passwd',
  'a/../../b',
  '.house-backups/x.json',
  '.house-autosave/snapshot-1.json',
  'notes.txt',
]

/** Names that look like `vernacular.json` and are not it. */
export const NAMES_LIKE_THE_DOCUMENT: readonly string[] = [
  'Vernacular.json',
  './vernacular.json',
  'x/vernacular.json',
  'vernacular.json/',
]

function toFullwidth(character: string): string {
  return String.fromCharCode(character.charCodeAt(0) + FULLWIDTH_OFFSET)
}

/** The hash with its first character that matches `pattern` changed by `change`. */
function withFirstChanged(
  hash: string,
  pattern: RegExp,
  change: (character: string) => string,
): string {
  const index = hash.search(pattern)
  if (index < 0) throw new Error(`the hash ${hash} has no character that matches ${pattern}`)
  return hash.slice(0, index) + change(hash.charAt(index)) + hash.slice(index + 1)
}

type NameOfHash = (hash: string) => string

/**
 * Names that look like `assets/<hash>` and are not an asset of the layout, each
 * with a short description. Each takes the true hash of the content it names.
 */
export const NAMES_LIKE_AN_ASSET: readonly (readonly [string, NameOfHash])[] = [
  ['the folder alone', () => ASSET_FOLDER],
  ['a short name that is no hash', () => `${ASSET_FOLDER}abc`],
  ['an ending after the hash', (hash) => `${ASSET_FOLDER}${hash}.png`],
  ['a hash in upper case', (hash) => `${ASSET_FOLDER}${hash.toUpperCase()}`],
  [
    'one upper-case digit in the hash',
    (hash) => ASSET_FOLDER + withFirstChanged(hash, /[a-f]/, (letter) => letter.toUpperCase()),
  ],
  [
    'a fullwidth letter in the hash',
    (hash) => ASSET_FOLDER + withFirstChanged(hash, /[a-f]/, toFullwidth),
  ],
  [
    'a fullwidth digit in the hash',
    (hash) => ASSET_FOLDER + withFirstChanged(hash, /[0-9]/, toFullwidth),
  ],
  ['a hash one digit short', (hash) => `${ASSET_FOLDER}${hash.slice(0, -1)}`],
  ['a hash one digit long', (hash) => `${ASSET_FOLDER}${hash}0`],
  ['a line break after the hash', (hash) => `${ASSET_FOLDER}${hash}\n`],
  ['a NUL after the hash', (hash) => `${ASSET_FOLDER}${hash}\u0000`],
  ['a path below the hash', (hash) => `${ASSET_FOLDER}${hash}/x`],
  ['a slash after the hash', (hash) => `${ASSET_FOLDER}${hash}/`],
  ['a capital first letter of the folder', (hash) => `Assets/${hash}`],
  ['the folder in upper case', (hash) => `ASSETS/${hash}`],
  ['a long s in the folder', (hash) => `a${LONG_S}sets/${hash}`],
  ['a backslash after the folder', (hash) => `assets\\${hash}`],
  ['a leading dot segment', (hash) => `./${ASSET_FOLDER}${hash}`],
  ['a doubled slash', (hash) => `${ASSET_FOLDER}/${hash}`],
  ['a folder above', (hash) => `x/${ASSET_FOLDER}${hash}`],
  ['a byte order mark before the name', (hash) => `${BYTE_ORDER_MARK}${ASSET_FOLDER}${hash}`],
]
