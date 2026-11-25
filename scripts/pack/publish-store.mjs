import { withStoreWriter } from './publish-store-disk.mjs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { declaresMediaTypes, isModelAsset } from '../../core/assets/asset-description.ts'
import { CATALOG_VERSION, validateCatalog } from '../../core/assets/catalog.ts'
import { namedFilesWithSources, readPackManifest } from '../../core/assets/pack-manifest-shape.ts'
import { validatePackManifest } from '../../core/assets/pack-manifest.ts'
import { comparePackVersions } from '../../core/assets/pack-version.ts'
import {
  blobPath,
  CATALOG_FILE,
  manifestPath,
  packTextPath,
} from '../../core/assets/store-paths.ts'

import {
  checkManifestEntry,
  checkPublishedLicenses,
  publishedEntry,
} from './publish-store-validation.mjs'

/** @typedef {import('../../core/assets/catalog.ts').CatalogPackEntry} CatalogPackEntry */
/** @typedef {import('../../core/assets/pack-manifest-shape.ts').ReadablePackManifest} ReadablePackManifest */
/** @typedef {import('../../core/assets/pack-manifest-shape.ts').NamedFile} NamedFile */
/** @typedef {import('../../core/assets/store-paths.ts').PackTextFile} PackTextFile */

/**
 * @typedef {object} PublishRequest
 * @property {string} packDir
 * @property {string} storeDir
 * @property {string} [name]
 */

/**
 * @typedef {object} PublishFiles
 * @property {(path: string) => Promise<Uint8Array | undefined>} readFile
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} writeFile
 */

const CATALOG_SCHEMA = 'https://drmrd.github.io/vernacular/schema/catalog/1/catalog.schema.json'
const MANIFEST_FILE = 'manifest.json'
const JSON_INDENT = 2
/** @type {readonly PackTextFile[]} */
const PACK_TEXT_FILES = ['LICENSE', 'NOTICE', 'CHANGELOG.md']

/**
 * @param {PublishFiles} io
 * @param {string} path
 * @param {string} [context]
 */
async function readRequiredFile(io, path, context = path) {
  const bytes = await io.readFile(path)
  if (bytes === undefined) throw new Error(`${context}: file is missing at ${path}`)
  return Buffer.from(bytes)
}

/** @param {Uint8Array} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** @param {Uint8Array} bytes @param {string} path */
function parseJson(bytes, path) {
  try {
    const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return JSON.parse(view.toString('utf8'))
  } catch (cause) {
    throw new Error(`${path}: invalid JSON`, { cause })
  }
}

/** @param {PublishFiles} io @param {string} path */
async function readManifest(io, path) {
  const bytes = await readRequiredFile(io, path)
  const value = parseJson(bytes, path)
  const manifest = readPackManifest(value)
  if (!manifest) throw new Error(`${path}: ${validatePackManifest(value).errors.join(', ')}`)
  return { bytes, manifest, digest: sha256(bytes) }
}

/**
 * @param {PublishFiles} io
 * @param {string} path
 */
async function readCatalog(io, path) {
  const bytes = await io.readFile(path)
  const result = bytes === undefined ? undefined : validateCatalog(parseJson(bytes, path))
  if (result?.outcome === 'invalid') throw new Error(`${path}: ${result.errors.join(', ')}`)
  if (result?.outcome === 'newer-version') throw new Error(`${path}: expected a version 1 catalog`)
  return result?.catalog
}

/**
 * @param {CatalogPackEntry} left
 * @param {CatalogPackEntry} right
 */
function compareCatalogEntries(left, right) {
  return (
    left.packId.localeCompare(right.packId, 'en') ||
    comparePackVersions(right.version, left.version)
  )
}

/** @param {ReadablePackManifest} manifest */
function checkDeclarations({ assets, formatVersion }) {
  if (!declaresMediaTypes(formatVersion)) return
  for (const asset of assets) {
    if (asset.byteLength === undefined) throw new Error(`${asset.name}: byteLength is required`)
    if (isModelAsset(asset, formatVersion) && asset.thumbnail === undefined) {
      throw new Error(`${asset.name}: thumbnail is required for a model`)
    }
  }
}

/** @param {PublishFiles} io @param {string} storeDir @param {CatalogPackEntry[]} packs */
async function* publishedManifests(io, storeDir, packs) {
  for (const entry of packs) {
    const path = join(storeDir, manifestPath(entry.manifest.sha256))
    const stored = await readManifest(io, path)
    checkManifestEntry(entry, stored, path)
    yield stored.manifest
  }
}

/** @param {NamedFile} file @param {Uint8Array} bytes @param {string} label */
function checkFileBytes(file, bytes, label) {
  if (sha256(bytes) !== file.contentHash)
    throw new Error(`${label}: contentHash differs from file bytes`)
  if (file.byteLength !== undefined && file.byteLength !== bytes.byteLength) {
    throw new Error(`${label}: byteLength differs from file size ${bytes.byteLength}`)
  }
}

/** @param {PublishFiles} io @param {CatalogPackEntry | undefined} previous */
function createWritePlan(io, previous) {
  /** @type {Map<string, Buffer>} */
  const writes = new Map()
  return {
    writes,
    /** @param {string} path @param {string} [context] */
    read: (path, context) => readRequiredFile(io, path, context),
    /** @param {string} path @param {Buffer} bytes */
    async check(path, bytes) {
      const stored = await io.readFile(path)
      if (stored === undefined) {
        if (previous) throw new Error(`${path}: published file is missing`)
        writes.set(path, bytes)
      } else if (!bytes.equals(stored)) {
        throw new Error(`${path}: stored file differs from source bytes`)
      }
    },
  }
}

/**
 * @param {PublishRequest} request
 * @param {ReturnType<typeof createWritePlan>} files
 * @param {ReadablePackManifest} manifest
 */
async function checkBlobs({ packDir, storeDir }, { read, check }, { assets }) {
  let byteLength = 0
  for (const asset of assets) {
    for (const { file, sourcePath } of namedFilesWithSources(asset)) {
      const label = `${asset.name} (${sourcePath})`
      const bytes = await read(join(packDir, sourcePath), label)
      checkFileBytes(file, bytes, label)
      byteLength += bytes.byteLength
      await check(join(storeDir, blobPath(file.contentHash)), bytes)
    }
  }
  return byteLength
}

/** @param {PublishRequest} request @param {PublishFiles} io @param {ReadablePackManifest} manifest */
async function readTexts({ packDir, storeDir }, io, { packId, version }) {
  const texts = new Map()
  for (const file of PACK_TEXT_FILES) {
    const bytes = await readRequiredFile(io, join(packDir, file))
    texts.set(join(storeDir, packTextPath(packId, version, file)), bytes)
  }
  return texts
}

/**
 * @param {PublishRequest} request
 * @param {PublishFiles} io
 * @returns {Promise<void>}
 */
export async function publishPack(request, io) {
  const { packDir, storeDir, name } = request
  const incoming = await readManifest(io, join(packDir, MANIFEST_FILE))
  const { manifest, bytes, digest } = incoming
  const { packId, version, formatVersion, assets } = manifest
  const catalogPath = join(storeDir, CATALOG_FILE)
  const catalog = await readCatalog(io, catalogPath)
  const packs = catalog?.packs ?? []
  const previous = publishedEntry(packs, incoming)
  checkDeclarations(manifest)
  const files = createWritePlan(io, previous)
  const byteLength = await checkBlobs(request, files, manifest)
  const texts = await readTexts(request, io, manifest)
  const storedManifestPath = join(storeDir, manifestPath(digest))
  await files.check(storedManifestPath, bytes)
  for (const [path, text] of texts) await files.check(path, text)
  if (previous) {
    checkManifestEntry(previous, incoming, storedManifestPath)
    if (previous.byteLength !== byteLength) throw new Error(`${catalogPath}: byteLength differs`)
    return
  }
  await checkPublishedLicenses(publishedManifests(io, storeDir, packs), manifest)
  const entry = {
    packId,
    version,
    formatVersion,
    manifest: { sha256: digest, byteLength: bytes.byteLength },
    byteLength,
    itemCount: assets.length,
  }
  const nextCatalog = {
    ...catalog,
    $schema: CATALOG_SCHEMA,
    catalogVersion: CATALOG_VERSION,
    name: name ?? catalog?.name,
    packs: [...packs, entry].sort(compareCatalogEntries),
  }
  const catalogBytes = Buffer.from(`${JSON.stringify(nextCatalog, null, JSON_INDENT)}\n`)
  for (const [path, file] of files.writes) await io.writeFile(path, file)
  await io.writeFile(catalogPath, catalogBytes)
}

/** @param {PublishRequest} request */
export function publishPackToDisk(request) {
  return withStoreWriter(request.storeDir, (io) => publishPack(request, io))
}
