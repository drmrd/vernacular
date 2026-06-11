// Type declarations for derive-underlay-fixture.mjs (the pure Tier-0 underlay
// fixture deriver) so the unit test can import it under the strict TypeScript
// config (allowJs is off, so an untyped .mjs import would otherwise be an error).

/** The per-plan calibration anchor that binds a corpus raster to world scale. */
export interface UnderlayCalibration {
  /** Hex-encoded SHA-256 of the raster bytes; the content-addressed asset id (ADR-0007). */
  contentHash: string
  /** Calibrated world millimeters per source image pixel. */
  millimetersPerPixel: number
  /** World position (mm) of the raster's top-left pixel. Defaults to the origin. */
  offset?: { x: number; y: number }
  /** Rotation in radians about the offset. Defaults to 0 (axis-aligned). */
  rotation?: number
  /** Underlay opacity, 0 (transparent) to 1 (opaque). Defaults to 1. */
  opacity?: number
}

/** The corpus `meta.json` fields the Tier-0 deriver reads. */
export interface CorpusPlanMeta {
  /** Two-digit-prefixed folder slug, used to name the derived fixture and Document. */
  slug: string
  /** Human-readable plan title, used as the Document's project name. */
  title: string
  /** The raster's pixel width (Underlay.width). */
  image_width_px: number
  /** The raster's pixel height (Underlay.height). */
  image_height_px: number
}

/**
 * Derive a Tier-0 underlay Document from a corpus plan's metadata and calibration
 * anchor: `meta` plus one `Floor` plus one calibrated raster `Underlay` that
 * references the raster as a content-addressed AssetReference (scope `project`).
 * Pure: it performs no I/O and returns a CORE-conformant Vernacular Floor Plan
 * Format Document.
 */
export function deriveUnderlayFixture(
  meta: CorpusPlanMeta,
  calibration: UnderlayCalibration,
): object
