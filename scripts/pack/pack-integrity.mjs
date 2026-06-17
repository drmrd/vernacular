// scripts/pack/pack-integrity.mjs
//
// Pure on-disk integrity checks for a vernacular-pack (design specification
// section 4.6). No direct filesystem access: it takes a parsed manifest and an
// injected PackReader, and returns the accumulated errors. When the in-app pack
// loader lands (phase 3) these checks graduate to core/ as shared TypeScript.

/**
 * @typedef {object} PackReader
 * @property {string} dirName                                   basename of the pack directory
 * @property {(rel: string) => Promise<string[]>} listDir       filenames in a subdir; [] if absent
 * @property {(rel: string) => Promise<boolean>} exists
 * @property {(rel: string) => Promise<string>} sha256          hex digest of a file's bytes
 * @property {(rel: string, length: number) => Promise<Uint8Array>} readBytes
 */

const ASSET_DIR = 'assets'
const THUMBNAIL_DIR = 'thumbnails'
const ASSET_EXTENSION = '.glb'
const THUMBNAIL_EXTENSION = '.webp'
const REQUIRED_FILES = ['LICENSE', 'NOTICE', 'CHANGELOG.md']
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const WEBP_HEADER_LENGTH = 12
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]
const WEBP_TAG_OFFSET = 8

/**
 * Whether the bytes at the given offset match the signature.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number[]} signature
 * @returns {boolean}
 */
function matchesAt(bytes, offset, signature) {
  return signature.every((b, i) => bytes[offset + i] === b)
}

/**
 * Whether the bytes carry the RIFF....WEBP signature in at least 12 bytes.
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function isWebp(bytes) {
  return (
    bytes != null &&
    bytes.length >= WEBP_HEADER_LENGTH &&
    matchesAt(bytes, 0, RIFF_SIGNATURE) &&
    matchesAt(bytes, WEBP_TAG_OFFSET, WEBP_SIGNATURE)
  )
}

/**
 * The asset entries declared by a manifest, or [] when none are present.
 * @param {object} manifest
 * @returns {object[]}
 */
function manifestAssets(manifest) {
  return Array.isArray(manifest?.assets) ? manifest.assets : []
}

/**
 * Confirm each asset's file bytes hash to its declared content hash.
 * @param {object[]} assets
 * @param {PackReader} reader
 * @param {string[]} errors
 * @returns {Promise<void>}
 */
async function checkAssetHashes(assets, reader, errors) {
  for (const asset of assets) {
    if (!SHA256_PATTERN.test(asset.contentHash)) continue
    const file = `${ASSET_DIR}/${asset.contentHash}${ASSET_EXTENSION}`
    if (!(await reader.exists(file))) {
      errors.push(`asset ${asset.contentHash}: asset file missing`)
      continue
    }
    const digest = await reader.sha256(file)
    if (digest !== asset.contentHash) {
      errors.push(`asset ${asset.contentHash}: content hash does not match the file bytes`)
    }
  }
}

/**
 * Confirm each asset has a thumbnail file in the pack.
 * @param {object[]} assets
 * @param {PackReader} reader
 * @param {string[]} errors
 * @returns {Promise<void>}
 */
async function checkThumbnails(assets, reader, errors) {
  for (const asset of assets) {
    if (!SHA256_PATTERN.test(asset.contentHash)) continue
    const file = `${THUMBNAIL_DIR}/${asset.contentHash}${THUMBNAIL_EXTENSION}`
    if (!(await reader.exists(file))) {
      errors.push(`asset ${asset.contentHash}: thumbnail missing`)
      continue
    }
    const bytes = await reader.readBytes(file, WEBP_HEADER_LENGTH)
    if (!isWebp(bytes)) {
      errors.push(`asset ${asset.contentHash}: thumbnail is not valid WebP`)
    }
  }
}

/**
 * Flag files in a directory that no manifest asset references.
 * @param {object[]} assets
 * @param {PackReader} reader
 * @param {string[]} errors
 * @returns {Promise<void>}
 */
async function checkOrphans(assets, reader, errors) {
  const referencedAssets = new Set(assets.map((a) => `${a.contentHash}${ASSET_EXTENSION}`))
  const referencedThumbnails = new Set(assets.map((a) => `${a.contentHash}${THUMBNAIL_EXTENSION}`))
  for (const name of await reader.listDir(ASSET_DIR)) {
    if (!referencedAssets.has(name)) {
      errors.push(`${ASSET_DIR}/${name}: orphan file not referenced by the manifest`)
    }
  }
  for (const name of await reader.listDir(THUMBNAIL_DIR)) {
    if (!referencedThumbnails.has(name)) {
      errors.push(`${THUMBNAIL_DIR}/${name}: orphan file not referenced by the manifest`)
    }
  }
}

/**
 * Confirm each required pack file is present.
 * @param {PackReader} reader
 * @param {string[]} errors
 * @returns {Promise<void>}
 */
async function checkRequiredFiles(reader, errors) {
  for (const name of REQUIRED_FILES) {
    if (!(await reader.exists(name))) {
      errors.push(`${name}: required pack file missing`)
    }
  }
}

/**
 * Confirm the pack directory name matches the packId and version.
 * @param {object} manifest
 * @param {PackReader} reader
 * @param {string[]} errors
 * @returns {void}
 */
function checkDirName(manifest, reader, errors) {
  const expected = `${manifest.packId}-${manifest.version}`
  if (reader.dirName !== expected) {
    errors.push(`pack directory name "${reader.dirName}" does not match expected "${expected}"`)
  }
}

/**
 * Verify a pack's on-disk files against its manifest.
 * @param {object} manifest
 * @param {PackReader} reader
 * @returns {Promise<{ errors: string[] }>}
 */
export async function checkPackIntegrity(manifest, reader) {
  const errors = []
  await checkAssetHashes(manifestAssets(manifest), reader, errors)
  await checkThumbnails(manifestAssets(manifest), reader, errors)
  await checkOrphans(manifestAssets(manifest), reader, errors)
  await checkRequiredFiles(reader, errors)
  checkDirName(manifest, reader, errors)
  return { errors }
}
