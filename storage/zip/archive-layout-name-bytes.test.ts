// @vitest-environment node
// Pure byte and archive logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { readArchive } from './read-archive'
import { withEntryName } from './zip-edges-test-kit'
import { buildZip, contentHashOf, documentEntry, seededBytes } from './zip-test-kit'

const encoder = new TextEncoder()
const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
const PICTURE = seededBytes(300)
const ASSET_INDEX = 1
const PLACEHOLDER_CHARACTER = 'x'

/** The bytes of `before`, then the raw bytes `raw`, then the bytes of `after`. */
function nameBytes(before: string, raw: readonly number[], after = ''): Uint8Array {
  return Uint8Array.from([...encoder.encode(before), ...raw, ...encoder.encode(after)])
}

/**
 * Names whose bytes look like `assets/<hash>` and are not an asset of the layout. Some are no
 * valid UTF-8; the others decode to a text that has more than the folder and the hash.
 */
const RAW_NAMES: readonly (readonly [string, (hash: string) => Uint8Array])[] = [
  ['a line feed after the hash', (hash) => nameBytes(`assets/${hash}`, [0x0a])],
  [
    'a carriage return and a line feed after the hash',
    (hash) => nameBytes(`assets/${hash}`, [0x0d, 0x0a]),
  ],
  ['a line separator after the hash', (hash) => nameBytes(`assets/${hash}`, [0xe2, 0x80, 0xa8])],
  ['a combining accent after the hash', (hash) => nameBytes(`assets/${hash}`, [0xcc, 0x81])],
  [
    'an encoded surrogate after the hash',
    (hash) => nameBytes(`assets/${hash}`, [0xed, 0xa0, 0x80]),
  ],
  ['an emoji after the hash', (hash) => nameBytes(`assets/${hash}`, [0xf0, 0x9f, 0x98, 0x80])],
  [
    'the byte FF in place of the last digit',
    (hash) => nameBytes(`assets/${hash.slice(0, -1)}`, [0xff]),
  ],
  ['an overlong slash after the folder', (hash) => nameBytes('assets', [0xc0, 0xaf], hash)],
  ['a fullwidth solidus after the folder', (hash) => nameBytes('assets', [0xef, 0xbc, 0x8f], hash)],
]

/** An archive of the document and PICTURE, with the name bytes of PICTURE's entry set to `name`. */
function archiveWithAssetName(name: Uint8Array): Uint8Array {
  const placeholder = PLACEHOLDER_CHARACTER.repeat(name.length)
  const built = buildZip([documentEntry(DOCUMENT), { name: placeholder, content: PICTURE }])
  return withEntryName(built, ASSET_INDEX, name)
}

describe('readArchive matches the name bytes of an asset exactly', () => {
  it('reads the asset when the patched name bytes are exactly assets/ and the hash', async () => {
    const hash = await contentHashOf(PICTURE)
    const bytes = archiveWithAssetName(nameBytes(`assets/${hash}`, []))

    const read = await readArchive(bytes)
    expect(read.ok && [...read.assets.keys()]).toEqual([hash])
  })

  it.each(RAW_NAMES)('a name with %s is in neither list', async (_case, nameOf) => {
    const bytes = archiveWithAssetName(nameOf(await contentHashOf(PICTURE)))

    expect(await readArchive(bytes)).toEqual({
      ok: true,
      document: DOCUMENT,
      assets: new Map(),
      rejectedAssets: [],
    })
  })
})
