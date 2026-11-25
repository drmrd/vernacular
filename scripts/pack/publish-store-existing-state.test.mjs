// @vitest-environment node
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  blobPath,
  CATALOG_FILE,
  expectRefusal,
  loadFixture,
  memoryStore,
  publish,
  STORE_DIR,
  textPath,
} from './publish-store-test-support.mjs'

const TEXT_FILES = ['LICENSE', 'NOTICE', 'CHANGELOG.md']
const NEXT_VERSION = '1.1.0'

function modelBytes(fixture, asset) {
  return fixture.files.get(join('assets', `${asset.contentHash}.glb`))
}

function storedManifestPath(fixture) {
  const hash = createHash('sha256').update(JSON.stringify(fixture.manifest)).digest('hex')
  return join(STORE_DIR, 'manifests', 'sha256', `${hash}.json`)
}

async function checkBlobReuse(fixture, published) {
  const [, lamp, settee] = fixture.manifest.assets
  const badPath = blobPath(settee.contentHash)
  const wrongBytes = modelBytes(fixture, lamp)
  const next = { ...fixture.manifest, version: NEXT_VERSION }
  for (const [label, seed] of [
    ['corrupt blob from an earlier publication', published],
    ['corrupt blob left before the catalog was written', new Map()],
  ]) {
    const store = memoryStore(seed)
    store.files.set(badPath, Buffer.from(wrongBytes))

    await expectRefusal(store, () => publish(store, fixture, next), {
      label,
      reason: /blob|hash|sha256|Example settee/i,
    })
    expect.soft(store.files.get(badPath)?.equals(wrongBytes), label).toBe(true)
  }
}

function retryFileCases(fixture, published) {
  const [, lamp, settee] = fixture.manifest.assets
  const path = storedManifestPath(fixture)
  const otherManifest = published.get(path).toString('utf8').replace('Jane Roe', 'Jane Doe')
  return [
    ['missing stored manifest', path, undefined, /manifest/i],
    ['corrupt stored manifest', path, Buffer.from(otherManifest), /manifest/i],
    ['missing stored model', blobPath(settee.contentHash), undefined, /blob|Example settee/i],
    [
      'corrupt stored model',
      blobPath(settee.contentHash),
      modelBytes(fixture, lamp),
      /blob|hash|sha256|Example settee/i,
    ],
    [
      'missing stored thumbnail',
      blobPath(settee.thumbnail.contentHash),
      undefined,
      /blob|thumbnail/i,
    ],
    [
      'corrupt stored thumbnail',
      blobPath(settee.thumbnail.contentHash),
      fixture.files.get(join('thumbnails', `${lamp.contentHash}.webp`)),
      /blob|thumbnail|hash|sha256/i,
    ],
    ...TEXT_FILES.map((name) => [
      `missing stored ${name}`,
      textPath(fixture.manifest, name),
      undefined,
      new RegExp(name.replace('.', '\\.'), 'i'),
    ]),
  ]
}

async function checkRetryFiles(fixture, published) {
  for (const [label, path, replacement, reason] of retryFileCases(fixture, published)) {
    const store = memoryStore(published)
    if (replacement === undefined) store.files.delete(path)
    else store.files.set(path, Buffer.from(replacement))

    await expectRefusal(store, () => publish(store, fixture), { label, reason })

    const current = store.files.get(path)
    expect.soft(current, label).toEqual(replacement)
  }
}

async function checkRetryCatalog(fixture, published) {
  const catalog = JSON.parse(published.get(CATALOG_FILE).toString('utf8'))
  const [entry] = catalog.packs
  const changes = [
    [
      'manifest length',
      { manifest: { ...entry.manifest, byteLength: entry.manifest.byteLength + 1 } },
    ],
    ['total blob length', { byteLength: entry.byteLength + 1 }],
    ['item count', { itemCount: entry.itemCount + 1 }],
    ['pack format', { formatVersion: entry.formatVersion + 1 }],
  ]
  for (const [field, change] of changes) {
    const inconsistent = { ...entry, ...change }
    for (const [order, packs] of [
      ['single row', [inconsistent]],
      ['before a matching row', [inconsistent, entry]],
      ['after a matching row', [entry, inconsistent]],
    ]) {
      const label = `inconsistent ${field} in the catalog (${order})`
      const store = memoryStore(published)
      const bytes = Buffer.from(JSON.stringify({ ...catalog, packs }))
      store.files.set(CATALOG_FILE, Buffer.from(bytes))

      await expectRefusal(store, () => publish(store, fixture), {
        label,
        reason: /catalog|manifest|pack|length|count|format/i,
      })
      expect.soft(store.files.get(CATALOG_FILE)?.equals(bytes), label).toBe(true)
    }
  }
}

async function checkUnpublishedRemnants(fixture, published) {
  const manifestPath = storedManifestPath(fixture)
  const noticePath = textPath(fixture.manifest, 'NOTICE')
  for (const [path, reason] of [
    [manifestPath, /manifest/i],
    [noticePath, /notice/i],
  ]) {
    const bytes = Buffer.from(published.get(path))
    bytes[0] ^= 1
    const store = memoryStore(new Map([[path, bytes]]))
    await expectRefusal(store, () => publish(store, fixture), {
      label: `conflicting unpublished ${path}`,
      reason,
    })
    expect.soft(store.files.get(path)?.equals(bytes), path).toBe(true)
  }

  const store = memoryStore(published)
  store.files.delete(CATALOG_FILE)
  await publish(store, fixture)
  expect
    .soft(store.writes, 'reuse matching files from an interrupted publication')
    .toEqual([CATALOG_FILE])
}

async function checkOlderRetry(fixture) {
  const original = structuredClone(fixture.manifest)
  const [sofa] = original.assets
  sofa.license = 'CC-BY-4.0'
  const store = memoryStore()
  await publish(store, fixture, original)
  await publish(store, fixture, { ...fixture.manifest, version: NEXT_VERSION })
  const writes = store.writes.length

  await publish(store, fixture, original)

  expect(store.writes).toHaveLength(writes)
}

describe('publishPack with an existing store', () => {
  it('preserves immutable files and validates stored files and catalog metadata before accepting a retry', async () => {
    const fixture = await loadFixture()
    const initial = memoryStore()
    await publish(initial, fixture)

    await checkBlobReuse(fixture, initial.files)
    await checkRetryFiles(fixture, initial.files)
    await checkRetryCatalog(fixture, initial.files)
    await checkUnpublishedRemnants(fixture, initial.files)
    await checkOlderRetry(fixture)
  })
})
