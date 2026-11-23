// scripts/pack/pack-integrity.mjs
//
// Pure on-disk integrity checks for a vernacular-pack (design specification
// section 4.6). No direct filesystem access: it takes a parsed manifest and an
// injected PackReader, and returns the accumulated errors. When the in-app pack
// loader lands (phase 3) these checks graduate to core/ as shared TypeScript.

import {
  assetFileName,
  isTextureAsset,
  packAssetMediaType,
} from '../../core/assets/asset-description.ts'
import { isRecord } from '../../core/assets/is-record.ts'
import { TEXTURE_LIMITS } from '../../core/assets/texture-asset-rules.ts'
import {
  textureFileProblems,
  textureFileSizeProblems,
} from '../../core/assets/texture-file-rules.ts'

/**
 * @typedef {object} PackReader
 * @property {string} dirName                                   basename of the pack directory
 * @property {(rel: string) => Promise<string[]>} listDir       filenames in a subdir; [] if absent
 * @property {(rel: string) => Promise<boolean>} exists
 * @property {(rel: string) => Promise<string>} sha256          hex digest of a file's bytes
 * @property {(rel: string, length: number) => Promise<Uint8Array>} readBytes
 * @property {(rel: string) => Promise<number>} size            file size in bytes
 */

const ASSET_DIR = 'assets'
const THUMBNAIL_DIR = 'thumbnails'
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
 * The object asset entries declared by a manifest, or [] when none are present.
 * @param {unknown} manifest
 * @returns {object[]}
 */
export function manifestAssets(manifest) {
  return Array.isArray(manifest?.assets) ? manifest.assets.filter(isRecord) : []
}

/**
 * The file name of an asset in assets/; an absent or unknown media type is the format 1 model.
 * @param {{ contentHash: string, mediaType?: string }} asset
 * @returns {string}
 */
function packAssetFileName(asset) {
  return assetFileName(asset.contentHash, packAssetMediaType(asset))
}

/**
 * The pack-relative path of an asset file.
 * @param {{ contentHash: string, mediaType?: string }} asset
 * @returns {string}
 */
function assetPath(asset) {
  return `${ASSET_DIR}/${packAssetFileName(asset)}`
}

/**
 * Confirm each asset's file bytes hash to its declared content hash.
 * @param {object[]} assets
 * @param {PackReader} reader
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {Promise<object[]>} the assets whose file is present and hashes correctly
 */
async function checkAssetHashes(assets, reader, context) {
  const { errors } = context
  const verified = []
  for (const asset of assets) {
    if (!SHA256_PATTERN.test(asset.contentHash)) continue
    const file = assetPath(asset)
    if (!(await reader.exists(file))) {
      errors.push(`asset ${asset.contentHash}: asset file missing at ${file}`)
      continue
    }
    const digest = await reader.sha256(file)
    if (digest !== asset.contentHash) {
      errors.push(
        `asset ${asset.contentHash}: content hash does not match the file bytes of ${file}`,
      )
      continue
    }
    verified.push(asset)
  }
  return verified
}

/**
 * Confirm each texture file's header agrees with its manifest entry.
 * @param {object[]} assets   assets whose files are present and hash correctly
 * @param {PackReader} reader
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {Promise<void>}
 */
async function checkTextureFiles(assets, reader, context) {
  const { errors, formatVersion } = context
  for (const asset of assets.filter((a) => isTextureAsset(a, formatVersion))) {
    const file = assetPath(asset)
    const fileSize = await reader.size(file)
    for (const problem of textureFileSizeProblems(fileSize)) {
      errors.push(`asset ${asset.contentHash}: ${problem}`)
    }
    const bytes = await reader.readBytes(file, TEXTURE_LIMITS.maxFileBytes)
    for (const problem of textureFileProblems(asset, bytes)) {
      errors.push(`asset ${asset.contentHash}: ${problem}`)
    }
  }
}

/**
 * Confirm each model asset has a WebP thumbnail in the pack; a texture's thumbnail is optional
 * but must be WebP when present.
 * @param {object[]} assets
 * @param {PackReader} reader
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {Promise<void>}
 */
async function checkThumbnails(assets, reader, context) {
  const { errors, formatVersion } = context
  for (const asset of assets) {
    if (!SHA256_PATTERN.test(asset.contentHash)) continue
    const file = `${THUMBNAIL_DIR}/${asset.contentHash}${THUMBNAIL_EXTENSION}`
    if (!(await reader.exists(file))) {
      if (!isTextureAsset(asset, formatVersion)) {
        errors.push(`asset ${asset.contentHash}: thumbnail missing`)
      }
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
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {Promise<void>}
 */
async function checkOrphans(assets, reader, context) {
  const { errors } = context
  const referencedAssets = new Set(assets.map(packAssetFileName))
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
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {Promise<void>}
 */
async function checkRequiredFiles(reader, context) {
  const { errors } = context
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
 * @param {{ errors: string[], formatVersion: unknown }} context
 * @returns {void}
 */
function checkDirName(manifest, reader, context) {
  const { errors } = context
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
  const context = { errors, formatVersion: manifest?.formatVersion }
  const verifiedAssets = await checkAssetHashes(manifestAssets(manifest), reader, context)
  await checkTextureFiles(verifiedAssets, reader, context)
  await checkThumbnails(manifestAssets(manifest), reader, context)
  await checkOrphans(manifestAssets(manifest), reader, context)
  await checkRequiredFiles(reader, context)
  checkDirName(manifest, reader, context)
  return { errors }
}
