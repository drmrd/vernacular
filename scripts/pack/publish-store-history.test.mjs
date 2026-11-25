// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publishPack } from './publish-store.mjs'

const FIXTURE_DIR = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const SOURCE_DIR = resolve('history-source-pack')
const STORE_DIR = resolve('history-store')
const SOURCE_MANIFEST_PATH = join(SOURCE_DIR, 'manifest.json')
const CATALOG_PATH = join(STORE_DIR, 'catalog.json')
const NEXT_VERSION = '1.1.0'
const WRONG_HISTORY_VERSION = '0.9.0'
const MALFORMED_JSON = Buffer.from('{"incomplete":')
const NARROWER_LICENSE = 'CC-BY-4.0'

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value))
}

async function publication() {
  const entries = await readdir(FIXTURE_DIR, { recursive: true, withFileTypes: true })
  const fixture = new Map(
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const path = join(entry.parentPath, entry.name)
          return [join(SOURCE_DIR, relative(FIXTURE_DIR, path)), await readFile(path)]
        }),
    ),
  )
  const sourceBytes = fixture.get(SOURCE_MANIFEST_PATH)
  const manifest = JSON.parse(sourceBytes.toString('utf8'))
  const files = new Map()
  const writes = []
  const io = {
    readFile: async (path) => fixture.get(path) ?? files.get(path),
    writeFile: async (path, bytes) => {
      writes.push(path)
      files.set(path, Buffer.from(bytes))
    },
  }

  function publish(bytes = sourceBytes) {
    fixture.set(SOURCE_MANIFEST_PATH, bytes)
    return publishPack({ packDir: SOURCE_DIR, storeDir: STORE_DIR }, io)
  }

  return { files, writes, publish, manifest, sourceBytes }
}

function storedCatalog({ files }) {
  return JSON.parse(files.get(CATALOG_PATH).toString('utf8'))
}

function snapshot({ files }) {
  return new Map([...files].map(([path, bytes]) => [path, Buffer.from(bytes)]))
}

async function expectUnwritten(store, { bytes, reason } = {}) {
  const before = snapshot(store)
  const writeCount = store.writes.length

  await expect(store.publish(bytes)).rejects.toThrow(reason)

  expect(store.writes).toHaveLength(writeCount)
  expect(store.files).toEqual(before)
}

function addConflictingRecord(store, matchingRecordFirst) {
  const catalog = storedCatalog(store)
  const [matching] = catalog.packs
  const bytes = Buffer.concat([store.sourceBytes, Buffer.from('\n')])
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  store.files.set(join(STORE_DIR, 'manifests', 'sha256', `${sha256}.json`), bytes)
  const conflicting = { ...matching, manifest: { sha256, byteLength: bytes.byteLength } }
  catalog.packs = matchingRecordFirst ? [matching, conflicting] : [conflicting, matching]
  store.files.set(CATALOG_PATH, jsonBytes(catalog))
}

describe('publishPack catalog history', () => {
  it('identifies malformed source manifest JSON before writing', async () => {
    const store = await publication()

    await expectUnwritten(store, { bytes: MALFORMED_JSON, reason: /manifest\.json/i })
  })

  it('identifies malformed catalog JSON before writing', async () => {
    const store = await publication()
    store.files.set(CATALOG_PATH, MALFORMED_JSON)

    await expectUnwritten(store, { reason: /catalog\.json/i })
  })

  it.each([true, false])(
    'refuses duplicate records for the incoming identity (matching record first: %s)',
    async (matchingRecordFirst) => {
      const store = await publication()
      await store.publish()
      addConflictingRecord(store, matchingRecordFirst)

      await expectUnwritten(store)
    },
  )

  it('refuses a new version when a historical manifest has a different byte length', async () => {
    const store = await publication()
    await store.publish()
    const catalog = storedCatalog(store)
    const [historical] = catalog.packs
    historical.manifest.byteLength += 1
    store.files.set(CATALOG_PATH, jsonBytes(catalog))

    await expectUnwritten(store, {
      bytes: jsonBytes({ ...store.manifest, version: NEXT_VERSION }),
      reason: `${historical.manifest.sha256}.json`,
    })
  })

  it('refuses a new version when a historical manifest has a different identity', async () => {
    const store = await publication()
    await store.publish()
    const catalog = storedCatalog(store)
    const [historical] = catalog.packs
    historical.version = WRONG_HISTORY_VERSION
    store.files.set(CATALOG_PATH, jsonBytes(catalog))

    await expectUnwritten(store, {
      bytes: jsonBytes({ ...store.manifest, version: NEXT_VERSION }),
      reason: `${historical.manifest.sha256}.json`,
    })
  })

  it('retries an older version after a later version broadened the rights', async () => {
    const store = await publication()
    const older = structuredClone(store.manifest)
    const [sofa] = older.assets
    sofa.license = NARROWER_LICENSE
    const olderBytes = jsonBytes(older)
    await store.publish(olderBytes)
    await store.publish(jsonBytes({ ...store.manifest, version: NEXT_VERSION }))
    const before = snapshot(store)
    const writeCount = store.writes.length

    await store.publish(olderBytes)

    expect(storedCatalog(store).packs.map(({ version }) => version)).toEqual([
      NEXT_VERSION,
      older.version,
    ])
    expect(store.writes).toHaveLength(writeCount)
    expect(store.files).toEqual(before)
  })
})
