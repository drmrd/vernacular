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
const SOURCE_DIR = resolve('publisher-test-packs')
const STORE_DIR = resolve('publisher-test-store')
const CATALOG_PATH = join(STORE_DIR, 'catalog.json')
const MANIFEST_FILE = 'manifest.json'
const NEW_VERSION = '1.1.0'
const OTHER_PACK_ID = 'parlor-furniture'
const LESS_PERMISSIVE_LICENSE = 'CC-BY-4.0'

async function furnitureFixture() {
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

function publication(fixture) {
  const inputs = new Map()
  const files = new Map()
  const writes = []
  const io = {
    readFile: async (path) => inputs.get(path) ?? files.get(path),
    writeFile: async (path, bytes) => {
      writes.push(path)
      files.set(path, Buffer.from(bytes))
    },
  }

  function supply(manifest, replacements = new Map()) {
    const packDir = join(SOURCE_DIR, `${manifest.packId}-${manifest.version}`)
    for (const [name, bytes] of fixture.files) {
      inputs.set(join(packDir, name), replacements.has(name) ? replacements.get(name) : bytes)
    }
    const manifestBytes = replacements.get(MANIFEST_FILE) ?? Buffer.from(JSON.stringify(manifest))
    inputs.set(join(packDir, MANIFEST_FILE), manifestBytes)
    return { packDir, storeDir: STORE_DIR }
  }

  return { files, writes, io, supply }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function modelFile(asset) {
  return join('assets', `${asset.contentHash}.glb`)
}

function thumbnailFile(asset) {
  return join('thumbnails', `${asset.contentHash}.webp`)
}

function catalogOf(store) {
  return JSON.parse(store.files.get(CATALOG_PATH).toString('utf8'))
}

async function publicationError(store, request) {
  return publishPack(request, store.io).then(
    () => undefined,
    (error) => error,
  )
}

function expectRejection(error, { label, reasons }) {
  expect.soft(error, label).toBeInstanceOf(Error)
  if (error instanceof Error) {
    for (const reason of reasons) expect.soft(error.message, label).toMatch(reason)
  }
}

async function expectUnwritten(store, request, problem) {
  const firstNewWrite = store.writes.length
  const error = await publicationError(store, request)
  expect.soft(store.writes.length - firstNewWrite, problem.label).toBe(0)
  expectRejection(error, problem)
}

function withSofaLicense(manifest, license) {
  const next = structuredClone(manifest)
  const [sofa] = next.assets
  sofa.license = license
  return next
}

async function checkMissingMetadata(fixture) {
  for (const field of ['byteLength', 'thumbnail']) {
    const store = publication(fixture)
    const manifest = structuredClone(fixture.manifest)
    const [sofa] = manifest.assets
    delete sofa[field]
    await expectUnwritten(store, store.supply(manifest), {
      label: `format 2 model without ${field}`,
      reasons: [/Example sofa/, new RegExp(field, 'i')],
    })
  }
}

async function checkReusedVersion(fixture) {
  const store = publication(fixture)
  await publishPack(store.supply(fixture.manifest), store.io)
  const changedBytes = Buffer.from(`${JSON.stringify(fixture.manifest)}\n`)
  const replacements = new Map([[MANIFEST_FILE, changedBytes]])

  await expectUnwritten(store, store.supply(fixture.manifest, replacements), {
    label: 'same pack version with a different manifest',
    reasons: [/example-furniture/, /1\.0\.0/],
  })
}

async function checkLicenseMoves(fixture) {
  const { manifest } = fixture
  const restricted = withSofaLicense(manifest, LESS_PERMISSIVE_LICENSE)
  for (const packId of [manifest.packId, OTHER_PACK_ID]) {
    const store = publication(fixture)
    await publishPack(store.supply(manifest), store.io)
    const changed = { ...restricted, packId, version: NEW_VERSION }
    await expectUnwritten(store, store.supply(changed), {
      label: `narrower rights for the same hash in ${packId}`,
      reasons: [/Example sofa/, /licen[sc]e/i],
    })
  }

  const reverse = publication(fixture)
  await publishPack(reverse.supply(restricted), reverse.io)
  await publishPack(reverse.supply({ ...manifest, version: NEW_VERSION }), reverse.io)
  expect(catalogOf(reverse).packs.map(({ version }) => version)).toEqual([NEW_VERSION, '1.0.0'])
}

async function checkUnreadableInputs(fixture) {
  const [, , settee] = fixture.manifest.assets
  const missing = publication(fixture)
  const replacements = new Map([[modelFile(settee), undefined]])
  await expectUnwritten(missing, missing.supply(fixture.manifest, replacements), {
    label: 'missing model source',
    reasons: [
      new RegExp(`Example settee|${settee.contentHash}`, 'i'),
      /missing|absent|not found|read/i,
    ],
  })

  const invalid = publication(fixture)
  await expectUnwritten(invalid, invalid.supply({ ...fixture.manifest, assets: null }), {
    label: 'invalid manifest',
    reasons: [/manifest/i, /invalid|assets/i],
  })

  const NEWER_CATALOG_VERSION = 2
  for (const [label, catalog, reasons] of [
    ['malformed catalog', { catalogVersion: 1, packs: {} }, [/catalog/i]],
    [
      'newer catalog',
      { catalogVersion: NEWER_CATALOG_VERSION, packs: [] },
      [/catalog/i, /newer|version|support/i],
    ],
  ]) {
    const store = publication(fixture)
    store.files.set(CATALOG_PATH, Buffer.from(JSON.stringify(catalog)))
    await expectUnwritten(store, store.supply(fixture.manifest), {
      label,
      reasons,
    })
  }
}

describe('publishPack refusal rules', () => {
  it('refuses a pack it cannot publish before writing', async () => {
    const fixture = await furnitureFixture()

    await checkMissingMetadata(fixture)
    await checkReusedVersion(fixture)
    await checkLicenseMoves(fixture)
    await checkUnreadableInputs(fixture)
  })
})

async function checkMismatchedBytes(fixture) {
  const [, lamp, settee] = fixture.manifest.assets
  const mismatches = [
    [modelFile(settee), modelFile(lamp)],
    [thumbnailFile(settee), thumbnailFile(lamp)],
  ]
  for (const [target, replacement] of mismatches) {
    const store = publication(fixture)
    const replacements = new Map([[target, fixture.files.get(replacement)]])
    await expectUnwritten(store, store.supply(fixture.manifest, replacements), {
      label: `different fixture bytes at ${target}`,
      reasons: [/sha256|hash|digest/i],
    })
  }

  const store = publication(fixture)
  const manifest = structuredClone(fixture.manifest)
  manifest.assets.find((asset) => asset.contentHash === settee.contentHash).byteLength += 1
  await expectUnwritten(store, store.supply(manifest), {
    label: 'declared byte length differs from the source bytes',
    reasons: [/length|size/i],
  })
}

function expectStoredBytesByAddress(store, manifest) {
  const [entry] = catalogOf(store).packs
  const manifestBytes = store.files.get(
    join(STORE_DIR, 'manifests', 'sha256', `${entry.manifest.sha256}.json`),
  )
  expect(sha256(manifestBytes)).toBe(entry.manifest.sha256)
  expect(manifestBytes.byteLength).toBe(entry.manifest.byteLength)
  expect(JSON.parse(manifestBytes.toString('utf8'))).toEqual(manifest)

  for (const asset of manifest.assets) {
    for (const file of [asset, asset.thumbnail]) {
      const bytes = store.files.get(join(STORE_DIR, 'blobs', 'sha256', file.contentHash))
      expect(sha256(bytes), asset.name).toBe(file.contentHash)
      expect(bytes.byteLength, asset.name).toBe(file.byteLength)
    }
  }
}

async function checkChangingSource(fixture) {
  const store = publication(fixture)
  const request = store.supply(fixture.manifest)
  const [, lamp, settee] = fixture.manifest.assets
  const target = join(request.packDir, modelFile(settee))
  const read = store.io.readFile
  let originalRead = false
  store.io.readFile = async (path) => {
    if (path !== target) return read(path)
    if (originalRead) return fixture.files.get(modelFile(lamp))
    originalRead = true
    return read(path)
  }

  const error = await publicationError(store, request)

  if (error === undefined) {
    expectStoredBytesByAddress(store, fixture.manifest)
  } else {
    expect.soft(store.writes, 'source changed after the first read').toEqual([])
    expectRejection(error, {
      label: 'source changed after the first read',
      reasons: [/sha256|hash|digest/i],
    })
  }
}

async function checkPortablePackId(fixture) {
  const store = publication(fixture)
  const manifest = { ...fixture.manifest, packId: 'parlor:collection' }
  await expectUnwritten(store, store.supply(manifest), {
    label: 'pack ID contains a character forbidden in a portable directory component',
    reasons: [/pack[ -]?id|parlor:collection/i],
  })
}

async function checkTextDirectoryCollision(fixture) {
  const store = publication(fixture)
  const first = { ...fixture.manifest, packId: OTHER_PACK_ID, version: '1.0.0-2.0.0' }
  const second = { ...fixture.manifest, packId: 'parlor-furniture-1.0.0', version: '2.0.0' }
  const notice = join(STORE_DIR, 'packs', 'parlor-furniture-1.0.0-2.0.0', 'NOTICE')
  await publishPack(store.supply(first), store.io)
  expect(store.files.get(notice)).toEqual(fixture.files.get('NOTICE'))

  const replacements = new Map([['NOTICE', Buffer.from('Notice for the second pack\n')]])
  await expectUnwritten(store, store.supply(second, replacements), {
    label: 'distinct pack identities have the same text directory',
    reasons: [/parlor-furniture-1\.0\.0-2\.0\.0/],
  })
  expect(
    store.files.get(notice)?.equals(fixture.files.get('NOTICE')),
    'first notice preserved',
  ).toBe(true)
}

describe('publishPack file integrity and immutable text paths', () => {
  it('checks the published buffers and rejects unusable or conflicting text paths before writing', async () => {
    const fixture = await furnitureFixture()

    await checkMismatchedBytes(fixture)
    await checkChangingSource(fixture)
    await checkPortablePackId(fixture)
    await checkTextDirectoryCollision(fixture)
  })
})
