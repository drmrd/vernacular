// @vitest-environment node
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { publishPackToDisk } from './publish-store.mjs'
import * as cli from './vernacular-pack.mjs'

const PACK_ID = 'example-furniture'
const PACK_VERSION = '1.0.0'
const PACK_DIRECTORY = PACK_ID + '-' + PACK_VERSION
const FURNITURE_PACK = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const LEGACY_PACK = fileURLToPath(
  new URL('../../public/packs/vernacular-starter-1.0.0', import.meta.url),
)

function afterReplacingManifest(publishPack, replaceManifest) {
  return async (request) => {
    await replaceManifest()
    return publishPack(request)
  }
}

function cliDeps(replaceManifest) {
  const deps = {
    readManifest: cli.readManifestFromDisk,
    createReader: cli.createNodePackReader,
    publishPack: afterReplacingManifest(publishPackToDisk, replaceManifest),
    log: vi.fn(),
    error: vi.fn(),
  }
  if (typeof cli.readPackPublicationFromDisk === 'function') {
    deps.readPackPublication = async (packDir) => {
      const publication = await cli.readPackPublicationFromDisk(packDir)
      return {
        manifest: publication.manifest,
        publishPack: afterReplacingManifest(publication.publishPack, replaceManifest),
      }
    }
  }
  return deps
}

async function snapshotStore(storeDir) {
  const entries = await readdir(storeDir, { recursive: true, withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(entry.parentPath, entry.name)
      return [relative(storeDir, path), entry.isFile() ? await readFile(path) : undefined]
    }),
  )
  return new Map(files)
}

async function expectUnchangedStore(storeDir, before) {
  const after = await snapshotStore(storeDir)
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
  for (const [path, bytes] of before) {
    if (bytes === undefined) expect(after.get(path), path).toBeUndefined()
    else expect(after.get(path)?.equals(bytes), path).toBe(true)
  }
}

function manifestAddress(bytes) {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
}

async function expectReviewedManifest(storeDir, reviewedBytes, replacementBytes) {
  const catalog = JSON.parse(await readFile(join(storeDir, 'catalog.json'), 'utf8'))
  const address = manifestAddress(reviewedBytes)
  expect(catalog.packs.filter(({ packId }) => packId === PACK_ID)).toEqual([
    expect.objectContaining({ version: PACK_VERSION, manifest: address }),
  ])
  const manifestDirectory = join(storeDir, 'manifests', 'sha256')
  const published = await readFile(join(manifestDirectory, address.sha256 + '.json'))
  expect(published.equals(reviewedBytes)).toBe(true)
  expect(await readdir(manifestDirectory)).not.toContain(
    manifestAddress(replacementBytes).sha256 + '.json',
  )
}

async function testReplacement(root) {
  const packDir = join(root, PACK_DIRECTORY)
  const storeDir = join(root, 'store')
  await cp(FURNITURE_PACK, packDir, { recursive: true })
  await publishPackToDisk({ packDir: LEGACY_PACK, storeDir })

  const sourcePath = join(packDir, 'manifest.json')
  const original = await readFile(sourcePath, 'utf8')
  const reviewedBytes = Buffer.from('\n' + original + '\n  \n')
  const replacementBytes = Buffer.from(
    JSON.stringify({ ...JSON.parse(original), attribution: 'A different furniture collection' }),
  )
  await writeFile(sourcePath, reviewedBytes)
  const before = await snapshotStore(storeDir)

  const replaceManifest = vi.fn(() => writeFile(sourcePath, replacementBytes))
  const deps = cliDeps(replaceManifest)
  const status = await cli.runPackCli(['publish', packDir, '--store', storeDir], deps)

  expect(replaceManifest).toHaveBeenCalledTimes(1)
  expect((await readFile(sourcePath)).equals(replacementBytes)).toBe(true)
  if (status === 0) {
    await expectReviewedManifest(storeDir, reviewedBytes, replacementBytes)
  } else {
    expect(typeof status).toBe('number')
    const errors = deps.error.mock.calls.map(([message]) => message).join('\n')
    expect(errors).toMatch(/manifest.*(?:chang|replac|differ|match)|pack.*chang/i)
    await expectUnchangedStore(storeDir, before)
  }
}

it('publishes only the reviewed manifest when a pack rebuild replaces it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vernacular-manifest-snapshot-'))
  try {
    await testReplacement(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
