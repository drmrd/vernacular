import { isAllowedLicenseMove } from '../../core/assets/license-moves.ts'
import { namedFiles } from '../../core/assets/pack-manifest-shape.ts'

/** @typedef {import('../../core/assets/catalog.ts').CatalogPackEntry} CatalogPackEntry */
/** @typedef {import('../../core/assets/pack-manifest-shape.ts').ReadablePackManifest} ReadablePackManifest */

const RESERVED_COMPONENT = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu
const UNSAFE_COMPONENT = /[<>:"/\\|?*\p{Cc}\p{Cs}]|[. ]$/u
const MAX_COMPONENT_BYTES = 255

/** @param {{packId: string, version: string}} scope */
function textDirectoryKey({ packId, version }) {
  const directory = `${packId}-${version}`
  if (
    UNSAFE_COMPONENT.test(directory) ||
    RESERVED_COMPONENT.test(directory) ||
    Buffer.byteLength(directory) > MAX_COMPONENT_BYTES
  ) {
    throw new Error(`packId ${JSON.stringify(packId)} cannot name a portable pack directory`)
  }
  return directory.normalize('NFC').toLowerCase()
}

/** @param {CatalogPackEntry[]} packs @param {{ manifest: ReadablePackManifest, digest: string }} incoming */
export function publishedEntry(packs, { manifest, digest }) {
  const directory = textDirectoryKey(manifest)
  let published
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
    published = entry
  }
  return published
}

/**
 * @param {CatalogPackEntry} entry
 * @param {{ manifest: ReadablePackManifest, digest: string, bytes: Uint8Array }} incoming
 * @param {string} path
 */
export function checkManifestEntry(entry, { manifest, digest, bytes }, path) {
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
}

/** @param {ReadablePackManifest} manifest */
function* licensedFiles(manifest) {
  for (const asset of manifest.assets) {
    for (const { contentHash } of namedFiles(asset)) {
      yield { contentHash, name: asset.name, license: asset.license }
    }
  }
}

/**
 * @param {AsyncIterable<ReadablePackManifest>} history
 * @param {ReadablePackManifest} manifest
 */
export async function checkPublishedLicenses(history, manifest) {
  /** @type {Map<string, Set<string>>} */
  const licenses = new Map()
  for await (const published of history) {
    for (const { contentHash, license } of licensedFiles(published)) {
      const previous = licenses.get(contentHash) ?? new Set()
      licenses.set(contentHash, previous.add(license))
    }
  }
  for (const { contentHash, name, license } of licensedFiles(manifest)) {
    for (const previous of licenses.get(contentHash) ?? []) {
      if (!isAllowedLicenseMove(previous, license)) {
        throw new Error(`${name}: license cannot move from ${previous} to ${license}`)
      }
    }
  }
}
