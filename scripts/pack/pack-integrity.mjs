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
const ASSET_EXTENSION = '.glb'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

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
    const digest = await reader.sha256(file)
    if (digest !== asset.contentHash) {
      errors.push(`asset ${asset.contentHash}: content hash does not match the file bytes`)
    }
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
  return { errors }
}
