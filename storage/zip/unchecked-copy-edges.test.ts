// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it, vi } from 'vitest'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { readArchive } from './read-archive'
import { buildUncheckedCopy } from './unchecked-copy'
import {
  assetNames,
  AUTOSAVE_SNAPSHOT,
  DOCUMENT,
  entriesOf,
  FIRST,
  FIRST_BYTES,
  poolHolding,
  projectFiles,
  SECOND,
  SECOND_BYTES,
  THIRD,
} from './unchecked-copy-test-kit'
import { contentHashOf } from './zip-test-kit'

const NO_BYTES = new Uint8Array(0)

describe('the edges of an unchecked copy', () => {
  it('holds an empty vernacular.json and an empty snapshot as empty entries', async () => {
    const files = projectFiles(NO_BYTES)
    files.set(`.house-autosave/${AUTOSAVE_SNAPSHOT}`, NO_BYTES)

    const copy = await buildUncheckedCopy(files, new InMemoryAssetCache(), [])

    const entries = entriesOf(copy)
    expect(entries.get('vernacular.json')).toHaveLength(0)
    expect(entries.get(`.house-autosave/${AUTOSAVE_SNAPSHOT}`)).toHaveLength(0)
    expect(await readArchive(copy.bytes)).toEqual({
      ok: true,
      document: NO_BYTES,
      assets: new Map(),
      rejectedAssets: [],
    })
  })

  it('holds an empty asset that the pool has and counts it', async () => {
    const emptyHash = await contentHashOf(NO_BYTES)
    const pool = await poolHolding([[emptyHash, NO_BYTES]])

    const copy = await buildUncheckedCopy(projectFiles(), pool, [emptyHash])

    expect(entriesOf(copy).get(`assets/${emptyHash}`)).toHaveLength(0)
    expect(copy.includedAssets).toBe(1)
  })

  it('leaves out an asset whose pool read throws at once and still makes the copy', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const readThrough = pool.get.bind(pool)
    vi.spyOn(pool, 'get').mockImplementation((hash) => {
      if (hash === FIRST) throw new Error('pool broke at once')
      return readThrough(hash)
    })

    const copy = await buildUncheckedCopy(projectFiles(), pool, [FIRST, SECOND])

    const entries = entriesOf(copy)
    expect(assetNames(entries)).toEqual([`assets/${SECOND}`])
    expect(entries.get('vernacular.json')).toEqual(DOCUMENT)
    expect(copy.includedAssets).toBe(1)
  })

  it('only reads the pool and leaves the files as they were', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])
    const write = vi.spyOn(pool, 'put')
    const files = projectFiles()
    const before = new Map([...files].map(([path, bytes]) => [path, bytes.slice()]))

    await buildUncheckedCopy(files, pool, [FIRST])

    expect(write).not.toHaveBeenCalled()
    expect(files).toEqual(before)
  })

  it('asks the pool for the listed assets in the order of the list', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])
    const read = vi.spyOn(pool, 'get')

    await buildUncheckedCopy(projectFiles(), pool, [SECOND, FIRST, THIRD])

    expect(read.mock.calls.map(([hash]) => hash)).toEqual([SECOND, FIRST, THIRD])
  })
})
