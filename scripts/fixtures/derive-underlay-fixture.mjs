// scripts/fixtures/derive-underlay-fixture.mjs
//
// Pure Tier-0 underlay fixture deriver. Given a corpus plan's metadata and its
// calibration anchor, it returns a CORE-conformant Vernacular Floor Plan Format
// Document: `meta` plus one `Floor` carrying a single calibrated raster
// `Underlay` that references the raster as a content-addressed AssetReference
// (scope `project`, ADR-0007). Performs no I/O.

import { SCHEMA_VERSION } from '../schema/build-schema.mjs'

// The canonical default ceiling height also lives in core/model/factories.ts, but this
// generator runs under plain `node`, which cannot import TypeScript source at runtime
// (the same reason build-schema.mjs reads factories.ts as text). A Tier-0 fixture has no
// rooms, so this default is cosmetic; the small duplication is deliberate, not drift.
const DEFAULT_CEILING_HEIGHT_MM = 2438

/**
 * Derive a Tier-0 underlay Document from corpus metadata and a calibration anchor.
 *
 * @param {import('./derive-underlay-fixture.d.mts').CorpusPlanMeta} meta
 * @param {import('./derive-underlay-fixture.d.mts').UnderlayCalibration} calibration
 * @returns {object} a CORE-conformant Vernacular Floor Plan Format Document
 */
export function deriveUnderlayFixture(meta, calibration) {
  const underlay = {
    id: 'underlay-1',
    source: {
      kind: 'raster',
      image: { scope: 'project', contentHash: calibration.contentHash },
    },
    width: meta.image_width_px,
    height: meta.image_height_px,
    placement: {
      offset: calibration.offset ?? { x: 0, y: 0 },
      millimetersPerPixel: calibration.millimetersPerPixel,
      rotation: calibration.rotation ?? 0,
    },
    opacity: calibration.opacity ?? 1,
    visible: true,
  }

  return {
    meta: {
      name: meta.title,
      units: 'imperial',
      period: 'unknown',
      schemaVersion: SCHEMA_VERSION,
      appVersion: '0.0.0-fixture',
      registryVersions: {},
    },
    floors: [
      {
        id: 'floor-1',
        name: 'Main Floor',
        elevation: 0,
        defaultCeilingHeight: DEFAULT_CEILING_HEIGHT_MM,
        walls: [],
        underlays: [underlay],
        openings: [],
        dimensions: [],
        furniture: [],
      },
    ],
    stairs: [],
  }
}
