// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { buildUncheckedCopy } from './unchecked-copy'
import {
  assetNames,
  documentNaming,
  entriesOf,
  FIRST,
  FIRST_BYTES,
  noProjectNaming,
  poolHolding,
  projectFiles,
  SECOND,
  SECOND_BYTES,
  THIRD,
} from './unchecked-copy-test-kit'

const NOT_JSON = Uint8Array.of(0xff, 0x00, 0xfe, 0x80, 0x7b)
const THIRD_BYTES = new TextEncoder().encode('the third model')
const NOT_A_CONTENT_HASH = 'not-a-content-hash'
const UPPER_CASE_HASH = 'A'.repeat(64)
const SECOND_FILE = `vernacular.format-${CURRENT_SCHEMA_VERSION}.json`
const NEWER_SECOND_FILE = `vernacular.format-${CURRENT_SCHEMA_VERSION + 1}.json`
const NEWER_VERSION = CURRENT_SCHEMA_VERSION + 1

/** The files of a project folder with a second document file `secondBytes` beside the main file. */
function filesBesideSecondFile(secondBytes: Uint8Array, name = SECOND_FILE) {
  const files = projectFiles()
  files.set(name, secondBytes)
  return files
}

describe('the assets that the document files of an unchecked copy name', () => {
  it('holds an asset that only a second document file names, when no asset is listed', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])
    const files = filesBesideSecondFile(documentNaming([FIRST]))

    const copy = await buildUncheckedCopy(files, pool, [])

    expect(entriesOf(copy).get(`assets/${FIRST}`)).toEqual(FIRST_BYTES)
    expect(copy.includedAssets).toBe(1)
  })

  it('holds an asset that a second file names when vernacular.json is no JSON', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])
    const files = projectFiles(NOT_JSON)
    files.set(SECOND_FILE, documentNaming([FIRST]))

    const copy = await buildUncheckedCopy(files, pool, [])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`])
  })

  it('holds the assets of a main file of a newer version and of a second file that is no project', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const files = projectFiles(documentNaming([FIRST], NEWER_VERSION))
    files.set(SECOND_FILE, noProjectNaming([SECOND]))

    const copy = await buildUncheckedCopy(files, pool, [])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`, `assets/${SECOND}`])
    expect(copy.includedAssets).toBe(2)
  })

  it('holds an asset that a second file above the version of this build names', async () => {
    const pool = await poolHolding([[THIRD, THIRD_BYTES]])
    const files = filesBesideSecondFile(documentNaming([THIRD], NEWER_VERSION), NEWER_SECOND_FILE)

    const copy = await buildUncheckedCopy(files, pool, [])

    expect(entriesOf(copy).get(`assets/${THIRD}`)).toEqual(THIRD_BYTES)
    expect(copy.includedAssets).toBe(1)
  })

  it('holds the listed assets and the assets that a file names, and packs one that both name once', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const read = vi.spyOn(pool, 'get')
    const files = filesBesideSecondFile(documentNaming([FIRST, SECOND]))

    const copy = await buildUncheckedCopy(files, pool, [FIRST])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`, `assets/${SECOND}`])
    expect(copy.includedAssets).toBe(2)
    expect(read.mock.calls.filter(([hash]) => hash === FIRST)).toHaveLength(1)
  })
})

describe('the assets that a file names and the pool cannot give to an unchecked copy', () => {
  it('leaves out an asset that a file names and the pool lacks, and does not count it', async () => {
    const pool = await poolHolding([[FIRST, FIRST_BYTES]])
    const files = filesBesideSecondFile(documentNaming([SECOND]))

    const copy = await buildUncheckedCopy(files, pool, [FIRST])

    expect(assetNames(entriesOf(copy))).toEqual([`assets/${FIRST}`])
    expect(copy.includedAssets).toBe(1)
  })

  it('leaves out a name in a file that is no content hash and does not ask the pool for it', async () => {
    const pool = await poolHolding([
      [NOT_A_CONTENT_HASH, FIRST_BYTES],
      [UPPER_CASE_HASH, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const read = vi.spyOn(pool, 'get')
    const files = filesBesideSecondFile(documentNaming([NOT_A_CONTENT_HASH, UPPER_CASE_HASH]))

    const copy = await buildUncheckedCopy(files, pool, [SECOND])

    expect(read.mock.calls.map(([hash]) => hash)).toEqual([SECOND])
    expect(assetNames(entriesOf(copy))).toEqual([`assets/${SECOND}`])
    expect(copy.includedAssets).toBe(1)
  })

  it('leaves every asset of the pool as it was', async () => {
    const pool = await poolHolding([
      [FIRST, FIRST_BYTES],
      [SECOND, SECOND_BYTES],
    ])
    const write = vi.spyOn(pool, 'put')
    const files = filesBesideSecondFile(documentNaming([FIRST]))

    await buildUncheckedCopy(files, pool, [SECOND])

    expect(write).not.toHaveBeenCalled()
    expect(await pool.get(FIRST)).toEqual(FIRST_BYTES)
    expect(await pool.get(SECOND)).toEqual(SECOND_BYTES)
  })
})
