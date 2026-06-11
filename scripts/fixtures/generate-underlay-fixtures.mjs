// scripts/fixtures/generate-underlay-fixtures.mjs
//
// Generation entry point for Tier-0 underlay fixtures. For every calibrated corpus
// plan (a meta.json with representabilityTier 0 and a calibration anchor), it reads
// the raster bytes, content-addresses them (hex SHA-256, the same hash the editor's
// underlay loader uses), derives a CORE-conformant Tier-0 Document with the pure
// deriveUnderlayFixture, and writes it under tests/fixtures/projects/corpus/ where the
// corpus conformance gate validates it. Run with `node scripts/fixtures/generate-underlay-fixtures.mjs`.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveUnderlayFixture } from './derive-underlay-fixture.mjs'

const CORPUS_DIR = resolve('resources/floor-plans')
const OUTPUT_DIR = resolve('tests/fixtures/projects/corpus')
const PLAN_DIR_PATTERN = /^\d\d-/
const TIER_0 = 0

/** Hex-encoded SHA-256 of the raster bytes; matches editor/plan/use-load-underlay-image.ts. */
function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Corpus plan folders calibrated for Tier-0 underlay derivation, in ordinal order. */
function calibratedPlanDirs() {
  return readdirSync(CORPUS_DIR)
    .filter((name) => PLAN_DIR_PATTERN.test(name))
    .filter((name) => {
      const meta = readMeta(name)
      return meta.representabilityTier === TIER_0 && meta.calibration !== undefined
    })
    .sort()
}

function readMeta(dirName) {
  return JSON.parse(readFileSync(resolve(CORPUS_DIR, dirName, 'meta.json'), 'utf8'))
}

function generateFixture(dirName) {
  const meta = readMeta(dirName)
  const rasterBytes = readFileSync(resolve(CORPUS_DIR, dirName, meta.image_file))
  const calibration = { ...meta.calibration, contentHash: sha256Hex(rasterBytes) }
  const document = deriveUnderlayFixture(meta, calibration)
  const outputPath = resolve(OUTPUT_DIR, `${dirName}.vernacular.json`)
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`)
  return outputPath
}

for (const dirName of calibratedPlanDirs()) {
  const outputPath = generateFixture(dirName)
  console.warn(`wrote ${outputPath}`)
}
