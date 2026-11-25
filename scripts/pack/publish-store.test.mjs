// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publishPack } from './publish-store.mjs'

const FURNITURE_PACK_DIR = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const STARTER_PACK_DIR = fileURLToPath(
  new URL('../../public/packs/vernacular-starter-1.1.1', import.meta.url),
)
const LEGACY_STARTER_PACK_DIR = fileURLToPath(
  new URL('../../public/packs/vernacular-starter-1.0.0', import.meta.url),
)
const NEXT_STARTER_VERSION = '1.1.2'
const LEGACY_MODEL_BYTE_LENGTH = 41
const STARTER_BLOB_COUNT = 4
const STORE_DIR = resolve('example-store')
const BLOB_DIR = join(STORE_DIR, 'blobs', 'sha256')
const CATALOG_PATH = join(STORE_DIR, 'catalog.json')
const CATALOG_NAME = 'Example Library'
const CATALOG_SCHEMA = 'https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json'
const PACK_TEXT_FILES = ['LICENSE', 'NOTICE', 'CHANGELOG.md']
const FURNITURE_ITEM_COUNT = 3
const STORED_PACKS = [
  { packId: 'attic-furniture', version: '1.0.0' },
  { packId: 'example-furniture', version: '0.10.0' },
  { packId: 'example-furniture', version: '0.9.0' },
  { packId: 'gallery-furniture', version: '1.0.0' },
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function manifestPath(bytes) {
  return join(STORE_DIR, 'manifests', 'sha256', `${sha256(bytes)}.json`)
}

async function readPack(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  const files = new Map(await Promise.all(paths.map(async (path) => [path, await readFile(path)])))
  const manifestBytes = files.get(join(directory, 'manifest.json'))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  return { directory, files, manifest, manifestBytes }
}

function blobFiles({ directory, files }) {
  const paths = [join(directory, 'assets'), join(directory, 'thumbnails')]
  return new Map(
    [...files]
      .filter(([path]) => paths.includes(dirname(path)))
      .map(([, bytes]) => [join(BLOB_DIR, sha256(bytes)), bytes]),
  )
}

function packTextFiles(pack, { packId, version } = pack.manifest) {
  const outputDirectory = join(STORE_DIR, 'packs', `${packId}-${version}`)
  return new Map(
    PACK_TEXT_FILES.map((name) => [
      join(outputDirectory, name),
      pack.files.get(join(pack.directory, name)),
    ]),
  )
}

function catalogEntry(manifest, bytes, byteLength) {
  const { packId, version, formatVersion = 1, assets } = manifest
  return {
    packId,
    version,
    formatVersion,
    manifest: { sha256: sha256(bytes), byteLength: bytes.length },
    byteLength:
      byteLength ??
      assets.reduce(
        (total, asset) => total + asset.byteLength + (asset.thumbnail?.byteLength ?? 0),
        0,
      ),
    itemCount: assets.length,
  }
}

async function storedHistory() {
  const source = await readPack(STARTER_PACK_DIR)
  const files = blobFiles(source)
  const entries = STORED_PACKS.map((identity) => {
    const manifest = { ...source.manifest, ...identity }
    const bytes = Buffer.from(JSON.stringify(manifest))
    files.set(manifestPath(bytes), bytes)
    for (const [path, text] of packTextFiles(source, identity)) files.set(path, text)
    return catalogEntry(manifest, bytes)
  })
  files.set(CATALOG_PATH, Buffer.from(JSON.stringify({ catalogVersion: 1, packs: entries })))
  return { files, entries }
}

function memoryStore(...fileSets) {
  const files = new Map(fileSets.flatMap((files) => [...files]))
  const writes = []
  return {
    files,
    writes,
    io: {
      readFile: async (path) => files.get(path),
      writeFile: async (path, bytes) => {
        writes.push(path)
        files.set(path, Buffer.from(bytes))
      },
    },
  }
}

function expectWriteOrder(paths, { blobs, manifest, texts }) {
  const endOfBlobs = blobs.size
  expect(paths.slice(0, endOfBlobs).sort()).toEqual([...blobs.keys()].sort())
  expect(paths[endOfBlobs]).toBe(manifest)
  expect(paths.slice(endOfBlobs + 1, -1).sort()).toEqual([...texts.keys()].sort())
  expect(paths.at(-1)).toBe(CATALOG_PATH)
}

function publishedBlobs({ files }) {
  return new Map([...files].filter(([path]) => dirname(path) === BLOB_DIR))
}

function expectSameFiles(actual, expected) {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort())
  for (const [path, bytes] of expected) {
    expect(actual.get(path).equals(bytes), path).toBe(true)
  }
}

function catalogPacks({ files }) {
  return JSON.parse(files.get(CATALOG_PATH).toString('utf8')).packs
}

function storeSnapshot({ files }) {
  return new Map(
    [...files]
      .filter(([path]) => path.startsWith(STORE_DIR + sep))
      .map(([path, bytes]) => [path, Buffer.from(bytes)]),
  )
}

async function publishToStore(pack, store) {
  await publishPack({ packDir: pack.directory, storeDir: STORE_DIR }, store.io)
}

async function expectRepeatablePublish(legacy, latest) {
  const store = memoryStore(legacy.files, latest.files)
  const [{ contentHash }] = legacy.manifest.assets
  const model = legacy.files.get(join(legacy.directory, 'assets', `${contentHash}.glb`))
  const legacyBlobs = new Map([[join(BLOB_DIR, contentHash), model]])
  const legacyEntry = catalogEntry(legacy.manifest, legacy.manifestBytes, LEGACY_MODEL_BYTE_LENGTH)

  await publishToStore(legacy, store)

  const manifest = store.files.get(manifestPath(legacy.manifestBytes))
  expect(manifest).toEqual(legacy.manifestBytes)
  const [legacyAsset] = JSON.parse(manifest.toString('utf8')).assets
  expect(legacyAsset).not.toHaveProperty('byteLength')
  expect(legacyAsset).not.toHaveProperty('thumbnail')
  expectSameFiles(publishedBlobs(store), legacyBlobs)
  expect(catalogPacks(store)).toEqual([legacyEntry])

  await publishToStore(latest, store)

  const latestEntry = catalogEntry(latest.manifest, latest.manifestBytes)
  const expectedEntries = [latestEntry, legacyEntry]
  const blobs = new Map([...legacyBlobs, ...blobFiles(latest)])
  expect(blobs.size).toBe(STARTER_BLOB_COUNT)
  expectSameFiles(publishedBlobs(store), blobs)
  expect(catalogPacks(store)).toEqual(expectedEntries)
  const beforeRetry = storeSnapshot(store)

  await publishToStore(latest, store)

  expect(catalogPacks(store)).toEqual(expectedEntries)
  expectSameFiles(storeSnapshot(store), beforeRetry)
  const immutableWrites = store.writes.filter((path) => path !== CATALOG_PATH)
  expect(immutableWrites.sort()).toEqual(
    [...beforeRetry.keys()].filter((path) => path !== CATALOG_PATH).sort(),
  )
}

function nextStarterPack({ directory, files, manifest }) {
  const nextDirectory = join(dirname(directory), `vernacular-starter-${NEXT_STARTER_VERSION}`)
  const nextManifest = { ...manifest, version: NEXT_STARTER_VERSION }
  const manifestBytes = Buffer.from(JSON.stringify(nextManifest))
  const nextFiles = new Map(
    [...files].map(([path, bytes]) => [join(nextDirectory, relative(directory, path)), bytes]),
  )
  nextFiles.set(join(nextDirectory, 'manifest.json'), manifestBytes)
  return { directory: nextDirectory, files: nextFiles, manifest: nextManifest, manifestBytes }
}

async function expectVersionsToShareBlobs(first) {
  const next = nextStarterPack(first)
  const store = memoryStore(first.files, next.files)
  const blobs = blobFiles(first)

  await publishToStore(first, store)
  await publishToStore(next, store)

  expect(catalogPacks(store)).toEqual([
    catalogEntry(next.manifest, next.manifestBytes),
    catalogEntry(first.manifest, first.manifestBytes),
  ])
  expectSameFiles(publishedBlobs(store), blobs)
  expect(store.writes.filter((path) => dirname(path) === BLOB_DIR).sort()).toEqual(
    [...blobs.keys()].sort(),
  )
}

describe('publishPack', () => {
  it('writes the pack bytes by hash, copies the text files, and updates the sorted catalog last', async () => {
    const pack = await readPack(FURNITURE_PACK_DIR)
    const history = await storedHistory()
    const store = memoryStore(pack.files, history.files)
    const blobs = blobFiles(pack)
    const manifest = manifestPath(pack.manifestBytes)
    const texts = packTextFiles(pack)

    await publishPack(
      { packDir: FURNITURE_PACK_DIR, storeDir: STORE_DIR, name: CATALOG_NAME },
      store.io,
    )

    expectWriteOrder(store.writes, { blobs, manifest, texts })
    for (const [path, bytes] of [...blobs, [manifest, pack.manifestBytes], ...texts]) {
      expect(store.files.get(path), path).toEqual(bytes)
    }

    const [attic, priorExample, olderExample, gallery] = history.entries
    const publishedEntry = catalogEntry(pack.manifest, pack.manifestBytes)
    expect(publishedEntry.itemCount).toBe(FURNITURE_ITEM_COUNT)
    expect(JSON.parse(store.files.get(CATALOG_PATH).toString('utf8'))).toEqual({
      $schema: CATALOG_SCHEMA,
      catalogVersion: 1,
      name: CATALOG_NAME,
      packs: [attic, publishedEntry, priorExample, olderExample, gallery],
    })
  })

  it('publishes each named blob once across versions and retries', async () => {
    const legacy = await readPack(LEGACY_STARTER_PACK_DIR)
    const latest = await readPack(STARTER_PACK_DIR)
    await expectRepeatablePublish(legacy, latest)
    await expectVersionsToShareBlobs(latest)
  })
})
