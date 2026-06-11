// scripts/fixtures/pack-building-archive.mjs
//
// Pure corpus `.building` archive assembler. Given a Tier-0 Vernacular Floor
// Plan Format Document, its underlay raster bytes plus content hash, and the
// generated attributions text, it returns the archive's folder entries
// (path -> bytes): the canonical `vernacular.json`, the raster stored as a
// content-addressed asset under `assets/<contentHash>`, and `ATTRIBUTIONS.md`.
// Zip the result with the storage/zip codec to produce the shareable archive.
// Performs no I/O.

// The asset directory prefix also lives in storage/directory-asset-cache.ts as
// ASSET_DIRECTORY_PREFIX, but this generator runs under plain `node`, which
// cannot import TypeScript source at runtime, so the literal is duplicated here
// deliberately to keep the on-disk layout in sync, not as drift.
const ASSET_DIRECTORY_PREFIX = 'assets'

/**
 * Build a `.building` archive's folder entries from a Tier-0 corpus plan.
 *
 * @param {import('./pack-building-archive.d.mts').BuildingArchiveInputs} inputs
 * @returns {Map<string, Uint8Array>} archive entries keyed by path
 */
export function buildBuildingArchiveEntries(inputs) {
  const encoder = new TextEncoder()
  const documentBytes = encoder.encode(JSON.stringify(inputs.document, null, 2) + '\n')

  return new Map([
    ['vernacular.json', documentBytes],
    [`${ASSET_DIRECTORY_PREFIX}/${inputs.contentHash}`, inputs.rasterBytes],
    ['ATTRIBUTIONS.md', encoder.encode(inputs.attributions)],
  ])
}

/**
 * Render an ATTRIBUTIONS.md from a corpus plan's license and provenance metadata.
 *
 * @param {import('./pack-building-archive.d.mts').CorpusLicenseMeta} meta
 * @returns {string} the ATTRIBUTIONS.md Markdown text
 */
export function buildAttributions(meta) {
  return [
    '# Attributions',
    '',
    'This archive bundles one openly-licensed floor-plan raster.',
    '',
    `## ${meta.title}`,
    '',
    `- Creator: ${meta.creator}`,
    `- Source: ${meta.source_landing_url}`,
    `- Rights: ${meta.rightsholder_or_source}`,
    `- License: ${meta.license} (${meta.license_url})`,
    '',
  ].join('\n')
}
