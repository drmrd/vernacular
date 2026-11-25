import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { assetFileName, packAssetMediaType } from '../../core/assets/asset-description.ts'
import { CATALOG_VERSION, validateCatalog } from '../../core/assets/catalog.ts'
import { namedFiles, readPackManifest } from '../../core/assets/pack-manifest-shape.ts'
import { comparePackVersions } from '../../core/assets/pack-version.ts'
import {
  blobPath,
  CATALOG_FILE,
  manifestPath,
  packTextPath,
} from '../../core/assets/store-paths.ts'

/** @typedef {import('../../core/assets/catalog.ts').CatalogPackEntry} CatalogPackEntry */
/** @typedef {import('../../core/assets/pack-manifest-shape.ts').ReadablePackAsset} ReadablePackAsset */
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
 * @returns {Promise<Uint8Array>}
 */
async function readRequiredFile(io, path) {
  const bytes = await io.readFile(path)
  if (bytes === undefined) throw new Error(`${path}: file is missing`)
  return bytes
}

/** @param {Uint8Array} bytes */
function parseJson(bytes) {
  return JSON.parse(Buffer.from(bytes).toString('utf8'))
}

/**
 * @param {PublishFiles} io
 * @param {string} path
 */
async function readCatalog(io, path) {
  const bytes = await io.readFile(path)
  const result = bytes === undefined ? undefined : validateCatalog(parseJson(bytes))
  if (result && result.outcome !== 'valid') throw new Error(`${path}: expected a version 1 catalog`)
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

/**
 * @param {PublishRequest} request
 * @param {PublishFiles} io
 * @param {readonly ReadablePackAsset[]} assets
 */
async function writeBlobs({ packDir, storeDir }, io, assets) {
  let byteLength = 0
  for (const asset of assets) {
    const modelOrTexture = `assets/${assetFileName(asset.contentHash, packAssetMediaType(asset))}`
    for (const [index, file] of namedFiles(asset).entries()) {
      const source = index === 0 ? modelOrTexture : `thumbnails/${asset.contentHash}.webp`
      const bytes = await readRequiredFile(io, join(packDir, source))
      await io.writeFile(join(storeDir, blobPath(file.contentHash)), bytes)
      byteLength += file.byteLength ?? bytes.byteLength
    }
  }
  return byteLength
}

/**
 * @param {PublishRequest} request
 * @param {PublishFiles} io
 * @returns {Promise<void>}
 */
export async function publishPack(request, io) {
  const { packDir, storeDir, name } = request
  const manifestBytes = await readRequiredFile(io, join(packDir, MANIFEST_FILE))
  const manifest = readPackManifest(parseJson(manifestBytes))
  if (!manifest) throw new Error(`${MANIFEST_FILE}: invalid pack manifest`)
  const { packId, version, formatVersion, assets } = manifest

  const catalogPath = join(storeDir, CATALOG_FILE)
  const catalog = await readCatalog(io, catalogPath)
  const sha256 = createHash('sha256').update(manifestBytes).digest('hex')
  const byteLength = await writeBlobs(request, io, assets)
  await io.writeFile(join(storeDir, manifestPath(sha256)), manifestBytes)
  for (const file of PACK_TEXT_FILES) {
    const bytes = await readRequiredFile(io, join(packDir, file))
    await io.writeFile(join(storeDir, packTextPath(packId, version, file)), bytes)
  }

  const entry = {
    packId,
    version,
    formatVersion,
    manifest: { sha256, byteLength: manifestBytes.byteLength },
    byteLength,
    itemCount: assets.length,
  }
  const nextCatalog = {
    $schema: CATALOG_SCHEMA,
    catalogVersion: CATALOG_VERSION,
    name: name ?? catalog?.name,
    packs: [...(catalog?.packs ?? []), entry].sort(compareCatalogEntries),
  }
  await io.writeFile(
    catalogPath,
    Buffer.from(`${JSON.stringify(nextCatalog, null, JSON_INDENT)}\n`),
  )
}
