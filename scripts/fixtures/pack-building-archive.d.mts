// Type declarations for pack-building-archive.mjs (the pure corpus `.building`
// archive assembler) so the conformance test can import it under the strict
// TypeScript config (allowJs is off), matching the deriver/build-schema pattern.

/** The license-provenance fields the ATTRIBUTIONS generator reads from a corpus meta.json. */
export interface CorpusLicenseMeta {
  title: string
  creator: string
  license: string
  license_url: string
  source_landing_url: string
  rightsholder_or_source: string
}

/** Inputs for assembling a `.building` archive folder for a Tier-0 corpus plan. */
export interface BuildingArchiveInputs {
  /** The Tier-0 Vernacular Floor Plan Format Document (becomes vernacular.json). */
  document: object
  /** The underlay raster bytes (stored as the content-addressed asset). */
  rasterBytes: Uint8Array
  /** The underlay's content hash; the asset is stored at `assets/<contentHash>`. */
  contentHash: string
  /** The generated ATTRIBUTIONS.md text. */
  attributions: string
}

/**
 * Build a `.building` archive's folder entries (path -> bytes): the canonical
 * `vernacular.json`, the underlay raster as a content-addressed asset under
 * `assets/<contentHash>`, and `ATTRIBUTIONS.md`. Pure; zip the result with the
 * storage/zip codec to produce the shareable archive.
 */
export function buildBuildingArchiveEntries(inputs: BuildingArchiveInputs): Map<string, Uint8Array>

/** Render an ATTRIBUTIONS.md from a corpus plan's license and provenance metadata. */
export function buildAttributions(meta: CorpusLicenseMeta): string
