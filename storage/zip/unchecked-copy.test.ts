// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { readArchive } from './read-archive'
import { buildUncheckedCopy } from './unchecked-copy'
import {
  assetNames,
  DOCUMENT,
  entriesOf,
  FIRST,
  FIRST_BYTES,
  poolHolding,
  projectFiles,
  AUTOSAVE_SNAPSHOT,
  NEWEST_BACKUP,
  SECOND,
  SECOND_BYTES,
  THIRD,
} from './unchecked-copy-test-kit'
import { zipFolder } from './zip-codec'
import { contentHashOf } from './zip-test-kit'

/** Bytes that are no JSON and no UTF-8 text. */
const NOT_JSON = Uint8Array.of(0xff, 0x00, 0xfe, 0x80, 0x7b)
const NOT_A_CONTENT_HASH = 'not-a-content-hash'
const UPPER_CASE_HASH = 'A'.repeat(64)
const BUILD_SECOND_FILE = `vernacular.format-${CURRENT_SCHEMA_VERSION}.json`
const NEWER_SECOND_FILE = `vernacular.format-${CURRENT_SCHEMA_VERSION + 1}.json`
const OLD_SECOND_FILE = 'vernacular.format-1.json'

describe('an unchecked copy of the stored files', () => {
  it('holds vernacular.json byte for byte, also when its bytes are no JSON', async () => {
    const copy = await buildUncheckedCopy(projectFiles(NOT_JSON), new InMemoryAssetCache(), [])

    expect(entriesOf(copy).get('vernacular.json')).toEqual(NOT_JSON)
  })

  it('holds each second document file byte for byte under its own name, whatever its version or content', async () => {
    const secondFiles = new Map([
      [BUILD_SECOND_FILE, DOCUMENT],
      [NEWER_SECOND_FILE, SECOND_BYTES],
      [OLD_SECOND_FILE, NOT_JSON],
    ])
    const files = projectFiles()
    for (const [name, bytes] of secondFiles) files.set(name, bytes)

    const copy = await buildUncheckedCopy(files, new InMemoryAssetCache(), [])

    const entries = entriesOf(copy)
    for (const [name, bytes] of secondFiles) expect(entries.get(name)).toEqual(bytes)
  })

  it('holds every file of the snapshot and backup folders under its own path', async () => {
    const files = projectFiles()
    files.set('.house-autosave/later.json', Uint8Array.of(5))
    files.set('.house-backups/older.json', Uint8Array.of(6, 7, 8))

    const copy = await buildUncheckedCopy(files, new InMemoryAssetCache(), [])

    const entries = entriesOf(copy)
    for (const [path, bytes] of files) expect(entries.get(path)).toEqual(bytes)
    expect(entries.size).toBe(files.size)
  })

  it('holds each listed asset that the pool has at assets/ under its hash, and counts them', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])

    const copy = await buildUncheckedCopy(projectFiles(), pool, [FIRST, SECOND])

    const entries = entriesOf(copy)
    expect(entries.get(`assets/${FIRST}`)).toEqual(FIRST_BYTES)
    expect(entries.get(`assets/${SECOND}`)).toEqual(SECOND_BYTES)
    expect(copy.includedAssets).toBe(2)
  })

  it('holds no asset and counts none when none is listed', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])

    const copy = await buildUncheckedCopy(projectFiles(), pool, [])

    expect(assetNames(entriesOf(copy))).toEqual([])
    expect(copy.includedAssets).toBe(0)
  })

  it('leaves out a listed asset that the pool lacks and does not count it', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])

    const copy = await buildUncheckedCopy(projectFiles(), pool, [SECOND, FIRST, THIRD])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`])
    expect(copy.includedAssets).toBe(1)
  })

  it('packs an asset that is listed twice once and counts it once', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const read = vi.spyOn(pool, 'get')

    const copy = await buildUncheckedCopy(projectFiles(), pool, [FIRST, SECOND, FIRST])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`, `assets/${SECOND}`])
    expect(copy.includedAssets).toBe(2)
    expect(read.mock.calls.filter(([hash]) => hash === FIRST)).toHaveLength(1)
  })

  it('leaves out a listed value that is not a content hash and does not ask the pool', async () => {
    const pool = await poolHolding([
      [NOT_A_CONTENT_HASH, FIRST_BYTES],
      [UPPER_CASE_HASH, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const read = vi.spyOn(pool, 'get')

    const copy = await buildUncheckedCopy(projectFiles(), pool, [
      NOT_A_CONTENT_HASH,
      UPPER_CASE_HASH,
      SECOND,
    ])

    expect(read.mock.calls.map(([hash]) => hash)).toEqual([SECOND])
    expect(assetNames(entriesOf(copy))).toEqual([`assets/${SECOND}`])
    expect(copy.includedAssets).toBe(1)
  })

  it('takes no other path of the files', async () => {
    const files = projectFiles()
    files.set(`assets/${THIRD}`, Uint8Array.of(9))
    files.set('assets/x', Uint8Array.of(9))
    files.set('notes.txt', Uint8Array.of(9))
    files.set('nested/vernacular.json', Uint8Array.of(9))
    files.set('nested/.house-backups/old.json', Uint8Array.of(9))
    files.set('.house-autosaved/other.json', Uint8Array.of(9))
    files.set('.house-backups-old/x.json', Uint8Array.of(9))
    files.set(`nested/${BUILD_SECOND_FILE}`, Uint8Array.of(9))
    files.set('vernacular.format-017.json', Uint8Array.of(9))
    files.set('vernacular.format-x.json', Uint8Array.of(9))

    const copy = await buildUncheckedCopy(files, new InMemoryAssetCache(), [])

    expect([...entriesOf(copy).keys()].sort()).toEqual([
      `.house-autosave/${AUTOSAVE_SNAPSHOT}`,
      `.house-backups/${NEWEST_BACKUP}`,
      'vernacular.json',
    ])
    expect(copy.includedAssets).toBe(0)
  })

  it('leaves out an asset whose pool read rejects and still makes the copy', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const readThrough = pool.get.bind(pool)
    vi.spyOn(pool, 'get').mockImplementation((hash) =>
      hash === FIRST ? Promise.reject(new Error('pool down')) : readThrough(hash),
    )

    const copy = await buildUncheckedCopy(projectFiles(), pool, [FIRST, SECOND])

    const entries = entriesOf(copy)
    expect(assetNames(entries)).toEqual([`assets/${SECOND}`])
    expect(entries.get('vernacular.json')).toEqual(DOCUMENT)
    expect(copy.includedAssets).toBe(1)
  })
})

describe('reading an unchecked copy back as an archive', () => {
  it('gives the document and the assets and nothing of the snapshots and backups', async () => {
    const firstHash = await contentHashOf(FIRST_BYTES)
    const secondHash = await contentHashOf(SECOND_BYTES)
    const pool = await poolHolding([
      [firstHash, FIRST_BYTES],
      [secondHash, SECOND_BYTES],
    ])

    const copy = await buildUncheckedCopy(projectFiles(), pool, [firstHash, secondHash])

    const read = await readArchive(copy.bytes)
    expect(read).toEqual({
      ok: true,
      document: DOCUMENT,
      assets: new Map([
        [firstHash, FIRST_BYTES],
        [secondHash, SECOND_BYTES],
      ]),
      rejectedAssets: [],
    })
  })

  it('gives the document of vernacular.json when the archive holds a second document file too', async () => {
    const archive = zipFolder(
      new Map([
        ['vernacular.json', DOCUMENT],
        [BUILD_SECOND_FILE, SECOND_BYTES],
      ]),
    )

    expect(await readArchive(archive)).toEqual({
      ok: true,
      document: DOCUMENT,
      assets: new Map(),
      rejectedAssets: [],
    })
  })

  it('gives no-document when the files hold no vernacular.json', async () => {
    const files = projectFiles()
    files.delete('vernacular.json')

    const copy = await buildUncheckedCopy(files, new InMemoryAssetCache(), [])

    expect(await readArchive(copy.bytes)).toEqual({
      ok: false,
      failure: { kind: 'no-document' },
    })
  })
})
