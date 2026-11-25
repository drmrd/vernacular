import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { publishPack } from './publish-store.mjs'

const FIXTURE_DIR = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const SOURCE_DIR = resolve('publisher-test-packs')
export const STORE_DIR = resolve('publisher-test-store')
export const CATALOG_FILE = join(STORE_DIR, 'catalog.json')
const MANIFEST_FILE = 'manifest.json'

export async function loadFixture() {
  const entries = await readdir(FIXTURE_DIR, { recursive: true, withFileTypes: true })
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  const files = new Map(
    await Promise.all(
      paths.map(async (path) => [relative(FIXTURE_DIR, path), await readFile(path)]),
    ),
  )
  return { files, manifest: JSON.parse(files.get(MANIFEST_FILE).toString('utf8')) }
}

export function memoryStore(seed = new Map()) {
  return {
    files: new Map([...seed].map(([path, bytes]) => [path, Buffer.from(bytes)])),
    writes: [],
  }
}

export async function publish(store, fixture, manifest = fixture.manifest) {
  const packDir = join(SOURCE_DIR, `${manifest.packId}-${manifest.version}`)
  const input = new Map([...fixture.files].map(([name, bytes]) => [join(packDir, name), bytes]))
  input.set(join(packDir, MANIFEST_FILE), Buffer.from(JSON.stringify(manifest)))

  return publishPack(
    { packDir, storeDir: STORE_DIR },
    {
      readFile: async (path) => input.get(path) ?? store.files.get(path),
      writeFile: async (path, bytes) => {
        store.writes.push(path)
        store.files.set(path, Buffer.from(bytes))
      },
    },
  )
}

export function blobPath(hash) {
  return join(STORE_DIR, 'blobs', 'sha256', hash)
}

export function textPath({ packId, version }, name) {
  return join(STORE_DIR, 'packs', `${packId}-${version}`, name)
}

export async function publicationError(request) {
  return request().then(
    () => undefined,
    (failure) => failure,
  )
}

export async function expectRefusal(store, request, { label, reason }) {
  const firstNewWrite = store.writes.length
  const error = await publicationError(request)

  expect.soft(store.writes.length - firstNewWrite, label).toBe(0)
  expect.soft(error, label).toBeInstanceOf(Error)
  if (error instanceof Error) expect.soft(error.message, label).toMatch(reason)
}
