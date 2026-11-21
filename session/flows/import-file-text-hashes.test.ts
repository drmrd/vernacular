// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeDocument, type AssetReference } from '../../core'
import {
  assetEntry,
  contentHashOf,
  projectArchive,
  projectReferring,
  seededBytes,
} from '../../storage/zip/zip-test-kit'
import { assetsOf } from '../handle/handle-assets'
import { createTestPorts } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { importFile } from './import-file'
import type { ImportResult } from './import-file'

const ABSENT = 'd'.repeat(64)
const MODEL = seededBytes(4096)

/** A reference whose content hash is an array with one text, as a hand-edited document can hold. */
function referenceWithArrayHash(contentHash: string): AssetReference {
  const parsed: unknown = JSON.parse(JSON.stringify({ scope: 'user', contentHash: [contentHash] }))
  return parsed as AssetReference
}

/** From now on each call to the pool of any project adds its value to the returned list. */
function recordPoolValues(ports: TestPorts): unknown[] {
  const asked: unknown[] = []
  const poolOf = ports.workspace.assets.bind(ports.workspace)
  ports.workspace.assets = (id) => {
    const pool = poolOf(id)
    return {
      has: (contentHash) => {
        asked.push(contentHash)
        return pool.has(contentHash)
      },
      get: (contentHash) => pool.get(contentHash),
      put: (contentHash, bytes) => {
        asked.push(contentHash)
        return pool.put(contentHash, bytes)
      },
    }
  }
  return asked
}

function opened(result: ImportResult): Extract<ImportResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected a project to open: ${JSON.stringify(result.failure)}`)
  return result
}

const handleOf = (result: ImportResult) => opened(result).handle
const missingAssetsOf = (result: ImportResult): unknown => opened(result).missingAssets

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('an import of a document whose content hash is not text', () => {
  it('is refused as a document that breaks the format rules, and the pool is not asked', async () => {
    const ports = createTestPorts()
    const asked = recordPoolValues(ports)
    const project = projectReferring([
      { scope: 'user', contentHash: ABSENT },
      referenceWithArrayHash(ABSENT),
    ])
    const file = { name: 'house.json', bytes: encodeDocument(project, undefined).bytes }

    const result = await importFile(ports, undefined, file)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'format-rules' } },
    })
    expect(asked).toEqual([])
  })
})

describe('an import of a document that refers to one asset twice', () => {
  it('missingAssets holds the hash once', async () => {
    const ports = createTestPorts()
    const project = projectReferring([
      { scope: 'user', contentHash: ABSENT },
      { scope: 'user', contentHash: ABSENT },
    ])
    const file = { name: 'house.json', bytes: encodeDocument(project, undefined).bytes }

    const result = await importFile(ports, undefined, file)

    expect(missingAssetsOf(result)).toEqual([ABSENT])
  })

  it('a reference to an asset that the archive lacks does not stop the copy of the one that it holds', async () => {
    const ports = createTestPorts()
    const model = await contentHashOf(MODEL)
    const project = projectReferring([
      { scope: 'user', contentHash: model },
      { scope: 'user', contentHash: ABSENT },
    ])
    const bytes = projectArchive(project, [await assetEntry(MODEL)])

    const result = await importFile(ports, undefined, { name: 'house.building', bytes })

    expect(await assetsOf(handleOf(result)).get(model)).toEqual(MODEL)
    expect(missingAssetsOf(result)).toEqual([ABSENT])
  })
})
