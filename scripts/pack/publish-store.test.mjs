// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publishPack } from './publish-store.mjs'

const FURNITURE_PACK_DIR = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const STARTER_PACK_DIR = fileURLToPath(
  new URL('../../public/packs/vernacular-starter-1.1.1', import.meta.url),
)
const STORE_DIR = resolve('example-store')
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
      .map(([, bytes]) => [join(STORE_DIR, 'blobs', 'sha256', sha256(bytes)), bytes]),
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

function catalogEntry(manifest, bytes) {
  const { packId, version, formatVersion, assets } = manifest
  return {
    packId,
    version,
    formatVersion,
    manifest: { sha256: sha256(bytes), byteLength: bytes.length },
    byteLength: assets.reduce(
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

function memoryStore(pack, history) {
  const files = new Map([...pack.files, ...history.files])
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

describe('publishPack', () => {
  it('writes the pack bytes by hash, copies the text files, and updates the sorted catalog last', async () => {
    const pack = await readPack(FURNITURE_PACK_DIR)
    const history = await storedHistory()
    const store = memoryStore(pack, history)
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
})
