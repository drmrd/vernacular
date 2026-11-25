import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { declaresMediaTypes, isModelAsset } from '../../core/assets/asset-description.ts'
import { CATALOG_VERSION, validateCatalog } from '../../core/assets/catalog.ts'
import { isAllowedLicenseMove } from '../../core/assets/license-moves.ts'
import { namedFilesWithSources, readPackManifest } from '../../core/assets/pack-manifest-shape.ts'
import { validatePackManifest } from '../../core/assets/pack-manifest.ts'
import { comparePackVersions } from '../../core/assets/pack-version.ts'
import {
  blobPath,
  CATALOG_FILE,
  manifestPath,
  packTextPath,
} from '../../core/assets/store-paths.ts'

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
    return JSON.parse(Buffer.from(bytes).toString('utf8'))
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

const RESERVED_COMPONENT = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu
const UNSAFE_COMPONENT = /[<>:"/\\|?*\p{Cc}]|[. ]$/u
const MAX_COMPONENT_BYTES = 255

/** @param {{packId: string, version: string}} scope */
function textDirectoryKey({ packId, version }) {
  const directory = `${packId}-${version}`
  if (
    UNSAFE_COMPONENT.test(packId) ||
    RESERVED_COMPONENT.test(packId) ||
    Buffer.byteLength(directory) > MAX_COMPONENT_BYTES
  ) {
    throw new Error(`packId ${JSON.stringify(packId)} cannot name a portable pack directory`)
  }
  return directory.normalize('NFC').toLowerCase()
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

/** @param {CatalogPackEntry[]} packs @param {Awaited<ReturnType<typeof readManifest>>} incoming */
function isPublished(packs, { manifest, digest }) {
  const directory = textDirectoryKey(manifest)
  let published = false
  for (const entry of packs) {
    if (textDirectoryKey(entry) !== directory) continue
    const scope = `${entry.packId}-${entry.version}`
    if (entry.packId !== manifest.packId || entry.version !== manifest.version) {
      throw new Error(
        `${scope}: pack text directory collides with ${manifest.packId}-${manifest.version}`,
      )
    }
    if (entry.manifest.sha256 !== digest)
      throw new Error(`${scope}: a different manifest is already published`)
    published = true
  }
  return published
}

/** @param {PublishFiles} io @param {string} storeDir @param {CatalogPackEntry} entry */
async function readPublishedManifest(io, storeDir, entry) {
  const path = join(storeDir, manifestPath(entry.manifest.sha256))
  const { bytes, manifest, digest } = await readManifest(io, path)
  if (
    digest !== entry.manifest.sha256 ||
    bytes.byteLength !== entry.manifest.byteLength ||
    manifest.packId !== entry.packId ||
    manifest.version !== entry.version ||
    manifest.formatVersion !== entry.formatVersion ||
    manifest.assets.length !== entry.itemCount
  ) {
    throw new Error(
      `${path}: manifest does not match catalog entry ${entry.packId}-${entry.version}`,
    )
  }
  return manifest
}

/**
 * @param {{storeDir: string, packs: CatalogPackEntry[]}} store
 * @param {PublishFiles} io
 * @param {ReadablePackManifest} manifest
 */
async function checkPublishedLicenses({ storeDir, packs }, io, manifest) {
  /** @type {Map<string, Set<string>>} */
  const licenses = new Map()
  for (const entry of packs) {
    const published = await readPublishedManifest(io, storeDir, entry)
    for (const asset of published.assets) {
      const previous = licenses.get(asset.contentHash) ?? new Set()
      licenses.set(asset.contentHash, previous.add(asset.license))
    }
  }
  for (const asset of manifest.assets) {
    for (const previous of licenses.get(asset.contentHash) ?? []) {
      if (!isAllowedLicenseMove(previous, asset.license)) {
        throw new Error(`${asset.name}: license cannot move from ${previous} to ${asset.license}`)
      }
    }
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

/** @param {PublishRequest} request @param {PublishFiles} io @param {ReadablePackManifest} manifest */
async function prepareBlobs({ packDir, storeDir }, io, manifest) {
  const writes = new Map()
  let byteLength = 0
  for (const asset of manifest.assets) {
    for (const { file, sourcePath } of namedFilesWithSources(asset)) {
      const label = `${asset.name} (${sourcePath})`
      const bytes = await readRequiredFile(io, join(packDir, sourcePath), label)
      checkFileBytes(file, bytes, label)
      byteLength += bytes.byteLength
      const target = join(storeDir, blobPath(file.contentHash))
      if ((await io.readFile(target)) === undefined) writes.set(target, bytes)
    }
  }
  return { writes, byteLength }
}

/** @param {PublishRequest} request @param {PublishFiles} io @param {ReadablePackManifest} manifest */
async function prepareTexts({ packDir, storeDir }, io, { packId, version }) {
  const writes = new Map()
  for (const file of PACK_TEXT_FILES) {
    const bytes = await readRequiredFile(io, join(packDir, file))
    writes.set(join(storeDir, packTextPath(packId, version, file)), bytes)
  }
  return writes
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
  if (isPublished(packs, incoming)) return
  checkDeclarations(manifest)
  await checkPublishedLicenses({ storeDir, packs }, io, manifest)
  const { writes, byteLength } = await prepareBlobs(request, io, manifest)
  const texts = await prepareTexts(request, io, manifest)
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
  for (const [path, blob] of writes) await io.writeFile(path, blob)
  await io.writeFile(join(storeDir, manifestPath(digest)), bytes)
  for (const [path, body] of texts) await io.writeFile(path, body)
  await io.writeFile(catalogPath, catalogBytes)
}
