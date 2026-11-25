// @vitest-environment node
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { expect, it, vi } from 'vitest'
import * as storePublisher from './publish-store.mjs'
import { createNodePackReader, readManifestFromDisk, runPackCli } from './vernacular-pack.mjs'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const FURNITURE_DIR = join(REPOSITORY_ROOT, 'tests/fixtures/packs/example-furniture-1.0.0')
const LEGACY_STARTER_DIR = join(REPOSITORY_ROOT, 'public/packs/vernacular-starter-1.0.0')
const CURRENT_STARTER_DIR = join(REPOSITORY_ROOT, 'public/packs/vernacular-starter-1.1.1')
const BROKEN_PACK_DIR = join(REPOSITORY_ROOT, 'tests/fixtures/packs/broken-pack-wrong')
const CATALOG_SCHEMA = 'https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json'
const CATALOG_NAME = 'Example Library'
const SOFA_HASH = '821078871bb03179c9a328f30a2152a56f568584d579fc6e3ea1213462a2b0e3'
const STORE_ARG = 'example-store'
const SUCCESS = 0
const USAGE_ERROR = 2
const CHILD_TIMEOUT_MS = 15_000
const TEST_TIMEOUT_MS = 30_000

function errorsFrom(error) {
  return error.mock.calls.map(([message]) => message).join('\n')
}

function expectFailure(code, messages, expectedMessage) {
  expect(typeof code).toBe('number')
  expect(code).not.toBe(SUCCESS)
  expect(messages).toMatch(expectedMessage)
}

async function expectUsageForMalformedPublish(deps) {
  const invalidFlags = [
    [],
    ['--store'],
    ['--store', '--name', CATALOG_NAME],
    ['--store', STORE_ARG, '--name'],
    ['--store', STORE_ARG, '--unknown'],
    ['--store', STORE_ARG, 'unexpected'],
  ]
  for (const flags of invalidFlags) {
    deps.error.mockClear()
    expect(await runPackCli(['publish', FURNITURE_DIR, ...flags], deps)).toBe(USAGE_ERROR)
    expect(errorsFrom(deps.error)).toMatch(/Usage/i)
  }
}

function publishCliDeps(publishPack) {
  return {
    readManifest: readManifestFromDisk,
    createReader: createNodePackReader,
    publishPack,
    writeReport: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  }
}

async function expectPublishCommandContract() {
  const publishPack = vi.fn(async () => {})
  const deps = publishCliDeps(publishPack)
  const args = ['publish', FURNITURE_DIR, '--store', STORE_ARG]
  const request = { packDir: FURNITURE_DIR, storeDir: STORE_ARG }

  expect(await runPackCli(args, deps)).toBe(SUCCESS)
  expect(await runPackCli([...args, '--name', CATALOG_NAME], deps)).toBe(SUCCESS)
  expect(publishPack.mock.calls).toStrictEqual([[request], [{ ...request, name: CATALOG_NAME }]])
  expect(deps.error).not.toHaveBeenCalled()
  publishPack.mockClear()

  const invalid = await runPackCli(['publish', BROKEN_PACK_DIR, '--store', STORE_ARG], deps)
  expectFailure(invalid, errorsFrom(deps.error), /content hash does not match/)
  await expectUsageForMalformedPublish(deps)
  expect(publishPack).not.toHaveBeenCalled()

  deps.error.mockClear()
  const refusal = 'Example sofa: published license cannot be restricted'
  publishPack.mockRejectedValueOnce(new Error(refusal))
  const refused = await runPackCli(args, deps)
  expectFailure(
    refused,
    errorsFrom(deps.error),
    /Example sofa: published license cannot be restricted/,
  )
  expect(publishPack.mock.calls).toStrictEqual([[request]])
  expect(deps.writeReport).not.toHaveBeenCalled()
}

function invokePublish(packDir, storeDir, { packageScript = false, flags = [] } = {}) {
  const program = packageScript ? 'pnpm' : process.execPath
  const command = packageScript ? ['pack:publish'] : ['scripts/pack/vernacular-pack.mjs', 'publish']
  const args = [...command, packDir, '--store', storeDir, ...flags]
  const options = {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, NODE_OPTIONS: '' },
    timeout: CHILD_TIMEOUT_MS,
  }
  return new Promise((resolve, reject) => {
    execFile(program, args, options, (failure) => {
      if (failure) reject(failure)
      else resolve()
    })
  })
}

function publishToDisk(packDir, storeDir) {
  return storePublisher.publishPackToDisk({ packDir, storeDir })
}

async function expectedEntry(packDir, details) {
  const bytes = await readFile(join(packDir, 'manifest.json'))
  return {
    ...details,
    manifest: {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length,
    },
  }
}

async function expectedEntries() {
  return Promise.all([
    expectedEntry(FURNITURE_DIR, {
      packId: 'example-furniture',
      version: '1.0.0',
      formatVersion: 2,
      byteLength: 6052,
      itemCount: 3,
    }),
    expectedEntry(CURRENT_STARTER_DIR, {
      packId: 'vernacular-starter',
      version: '1.1.1',
      formatVersion: 2,
      byteLength: 787131,
      itemCount: 2,
    }),
    expectedEntry(LEGACY_STARTER_DIR, {
      packId: 'vernacular-starter',
      version: '1.0.0',
      formatVersion: 1,
      byteLength: 41,
      itemCount: 1,
    }),
  ])
}

async function readCatalog(storeDir) {
  return JSON.parse(await readFile(join(storeDir, 'catalog.json'), 'utf8'))
}

async function storeFiles(storeDir) {
  const files = await readdir(storeDir, { withFileTypes: true, recursive: true })
  const paths = files
    .filter((file) => file.isFile())
    .map((file) => join(file.parentPath, file.name))
  return Object.fromEntries(
    await Promise.all(paths.map(async (path) => [relative(storeDir, path), await readFile(path)])),
  )
}

async function expectUnreadableCatalogToRefusePublish(storeDir) {
  const catalogPath = join(storeDir, 'catalog.json')
  const savedCatalogPath = join(storeDir, 'saved-catalog.json')
  await rename(catalogPath, savedCatalogPath)
  await mkdir(catalogPath)
  const before = await storeFiles(storeDir)

  const deps = publishCliDeps(storePublisher.publishPackToDisk)
  const code = await runPackCli(['publish', FURNITURE_DIR, '--store', storeDir], deps)
  expectFailure(code, errorsFrom(deps.error), /EISDIR|directory|read.*catalog/i)
  expect((await stat(catalogPath)).isDirectory()).toBe(true)
  expect(await storeFiles(storeDir)).toEqual(before)

  await rmdir(catalogPath)
  await rename(savedCatalogPath, catalogPath)
}

async function expectPublishersToPreserveBothEntries(storeDir, expected, publish) {
  const packDirs = [FURNITURE_DIR, LEGACY_STARTER_DIR]
  const results = await Promise.allSettled(packDirs.map((packDir) => publish(packDir, storeDir)))
  const [furniture, legacy] = results
  const [furnitureEntry, currentEntry, legacyEntry] = expected.packs
  expect([furniture.status, legacy.status]).toContain('fulfilled')

  const persisted = [currentEntry]
  if (furniture.status === 'fulfilled') persisted.unshift(furnitureEntry)
  if (legacy.status === 'fulfilled') persisted.push(legacyEntry)
  expect(await readCatalog(storeDir)).toEqual({ ...expected, packs: persisted })

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') continue
    expect(result.reason).toBeInstanceOf(Error)
    expect(result.reason.message).toMatch(/busy|lock|in progress|another publish/i)
    await publish(packDirs[index], storeDir)
  }
  expect(await readCatalog(storeDir)).toEqual(expected)
}

async function expectImmutableBytes(storeDir, furnitureEntry) {
  const manifest = await readFile(
    join(storeDir, 'manifests', 'sha256', furnitureEntry.manifest.sha256 + '.json'),
  )
  expect(manifest).toEqual(await readFile(join(FURNITURE_DIR, 'manifest.json')))
  expect(await readFile(join(storeDir, 'blobs', 'sha256', SOFA_HASH))).toEqual(
    await readFile(join(FURNITURE_DIR, 'assets', SOFA_HASH + '.glb')),
  )
  expect(await readFile(join(storeDir, 'packs', 'example-furniture-1.0.0', 'LICENSE'))).toEqual(
    await readFile(join(FURNITURE_DIR, 'LICENSE')),
  )
}

async function expectUnchangedAfterRetryAndFailures(parent, storeDir) {
  const before = await storeFiles(storeDir)
  const deps = publishCliDeps(storePublisher.publishPackToDisk)
  const invalid = await runPackCli(['publish', BROKEN_PACK_DIR, '--store', storeDir], deps)
  expectFailure(invalid, errorsFrom(deps.error), /content hash does not match/)
  expect(await storeFiles(storeDir)).toEqual(before)

  const conflictingPack = join(parent, 'example-furniture-1.0.0')
  await cp(FURNITURE_DIR, conflictingPack, { recursive: true })
  await appendFile(join(conflictingPack, 'manifest.json'), '\n')
  deps.error.mockClear()
  const refusal = await runPackCli(['publish', conflictingPack, '--store', storeDir], deps)
  expectFailure(refusal, errorsFrom(deps.error), /different manifest|already published/i)
  expect(await storeFiles(storeDir)).toEqual(before)

  await publishToDisk(FURNITURE_DIR, storeDir)
  expect(await storeFiles(storeDir)).toEqual(before)
}

async function expectPlainNodePublish(parent, expected) {
  const storeDir = join(parent, 'command-line store')
  const [furnitureEntry, currentEntry] = expected.packs
  await invokePublish(CURRENT_STARTER_DIR, storeDir, {
    packageScript: true,
    flags: ['--name', CATALOG_NAME],
  })
  expect(await readCatalog(storeDir)).toEqual({ ...expected, packs: [currentEntry] })

  await expectPublishersToPreserveBothEntries(storeDir, expected, invokePublish)
  await expectImmutableBytes(storeDir, furnitureEntry)
}

async function expectDiskPublish() {
  const parent = await mkdtemp(join(tmpdir(), 'vernacular-publish-'))
  try {
    const storeDir = join(parent, 'library store')
    await storePublisher.publishPackToDisk({
      packDir: CURRENT_STARTER_DIR,
      storeDir,
      name: CATALOG_NAME,
    })
    const packs = await expectedEntries()
    const expected = { $schema: CATALOG_SCHEMA, catalogVersion: 1, name: CATALOG_NAME, packs }
    expect(await readCatalog(storeDir)).toEqual({ ...expected, packs: [packs[1]] })
    await expectUnreadableCatalogToRefusePublish(storeDir)
    await expectPublishersToPreserveBothEntries(storeDir, expected, publishToDisk)
    await expectImmutableBytes(storeDir, packs[0])
    await expectUnchangedAfterRetryAndFailures(parent, storeDir)
    await expectPlainNodePublish(parent, expected)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}

it(
  'publishes validated packs through the command line and preserves the store on a refusal',
  async () => {
    await expectPublishCommandContract()
    await expectDiskPublish()
  },
  TEST_TIMEOUT_MS,
)
