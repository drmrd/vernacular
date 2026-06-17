#!/usr/bin/env node
// scripts/pack/vernacular-pack.mjs
//
// vernacular-pack CLI scaffold (design specification section 4.3; phase 0 deliverable).
// Subcommands: `validate <packDir>` and `build <packDir>`. For this scaffold, `build`
// performs the same validation and reports a summary; content-hash verification,
// thumbnail baking, and publishing are deferred to phase 3.

import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePackManifest } from './manifest-validation.mjs'
import { checkPackIntegrity } from './pack-integrity.mjs'
import { isShareAlike, shareAlikeWarning } from './license-policy.mjs'

const EXIT_OK = 0
const EXIT_INVALID = 1
const EXIT_USAGE = 2
const EXIT_INTERNAL = 3
const USAGE = 'Usage: vernacular-pack <validate|build> <packDir>'

/**
 * @typedef {object} PackCliDeps
 * @property {(packDir: string) => Promise<unknown>} readManifest
 * @property {(packDir: string) => import('./pack-integrity.mjs').PackReader} createReader
 * @property {(packDir: string, report: object) => Promise<void>} writeReport
 * @property {(message: string) => void} log
 * @property {(message: string) => void} error
 */

/**
 * Whether a manifest is shaped well enough to read its on-disk files.
 * @param {unknown} manifest
 * @returns {boolean}
 */
function isReadableManifest(manifest) {
  return manifest != null && typeof manifest === 'object' && Array.isArray(manifest.assets)
}

/**
 * The license strings declared by a pack and its assets.
 * @param {object} manifest
 * @returns {string[]}
 */
function collectLicenses(manifest) {
  const licenses = []
  if (typeof manifest.license === 'string') licenses.push(manifest.license)
  for (const asset of Array.isArray(manifest.assets) ? manifest.assets : []) {
    if (typeof asset.license === 'string') licenses.push(asset.license)
  }
  return licenses
}

/**
 * Combine manifest-shape, on-disk integrity, and license review for a pack.
 * @param {unknown} manifest
 * @param {import('./pack-integrity.mjs').PackReader} reader
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
async function reviewPack(manifest, reader) {
  const manifestResult = validatePackManifest(manifest)
  const integrity = isReadableManifest(manifest)
    ? await checkPackIntegrity(manifest, reader)
    : { errors: [] }
  const warning = shareAlikeWarning(collectLicenses(manifest))
  return {
    errors: [...manifestResult.errors, ...integrity.errors],
    warnings: warning ? [warning] : [],
  }
}

/**
 * Build a build report from a manifest and its review outcome.
 * @param {object} manifest
 * @param {{ errors: string[], warnings: string[] }} review
 * @returns {object}
 */
function buildReport(manifest, review) {
  const assets = (Array.isArray(manifest?.assets) ? manifest.assets : []).map((asset) => ({
    name: asset.name,
    contentHash: asset.contentHash,
  }))
  const licenses = collectLicenses(manifest)
  return {
    status: review.errors.length === 0 ? 'PASS' : 'FAIL',
    assets,
    licenses: { distinct: [...new Set(licenses)], shareAlike: licenses.some(isShareAlike) },
    warnings: review.warnings,
    errors: review.errors,
  }
}

/**
 * Report each review error against the pack directory.
 * @param {PackCliDeps} deps
 * @param {string} packDir
 * @param {string[]} errors
 * @returns {void}
 */
function reportErrors(deps, packDir, errors) {
  deps.error(`Invalid pack ${packDir}:`)
  for (const message of errors) {
    deps.error(`  - ${message}`)
  }
}

/**
 * @param {readonly string[]} argv arguments after the node binary and script path
 * @param {PackCliDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runPackCli(argv, deps) {
  const [command, packDir] = argv
  if ((command !== 'validate' && command !== 'build') || !packDir) {
    deps.error(USAGE)
    return EXIT_USAGE
  }
  let manifest
  try {
    manifest = await deps.readManifest(packDir)
  } catch (cause) {
    deps.error(`Could not read manifest in ${packDir}: ${String(cause)}`)
    return EXIT_INVALID
  }
  const review = await reviewPack(manifest, deps.createReader(packDir))
  for (const warning of review.warnings) {
    deps.log(`warning: ${warning}`)
  }
  if (command === 'build') {
    await deps.writeReport(packDir, buildReport(manifest, review))
  }
  if (review.errors.length > 0) {
    reportErrors(deps, packDir, review.errors)
    return EXIT_INVALID
  }
  deps.log(`${command}: ${packDir} is a valid pack`)
  return EXIT_OK
}

/** Read <packDir>/manifest.json from disk. */
export async function readManifestFromDisk(packDir) {
  const raw = await readFile(join(packDir, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

/**
 * A {@link PackReader} backed by the real filesystem under `packDir`.
 * @param {string} packDir
 * @returns {import('./pack-integrity.mjs').PackReader}
 */
export function createNodePackReader(packDir) {
  return {
    dirName: basename(packDir),
    listDir: async (rel) => {
      try {
        return await readdir(join(packDir, rel))
      } catch {
        return []
      }
    },
    exists: async (rel) => {
      try {
        await access(join(packDir, rel))
        return true
      } catch {
        return false
      }
    },
    sha256: async (rel) =>
      createHash('sha256')
        .update(await readFile(join(packDir, rel)))
        .digest('hex'),
    readBytes: async (rel, length) =>
      new Uint8Array((await readFile(join(packDir, rel))).subarray(0, length)),
  }
}

/**
 * Write a build report to a sibling of `packDir`, outside the immutable pack content.
 * @param {string} packDir
 * @param {object} report
 * @returns {Promise<void>}
 */
export async function writeReportToDisk(packDir, report) {
  const target = join(dirname(packDir), `${basename(packDir)}-build-report.json`)
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`)
}

// Run only when invoked directly (node scripts/pack/vernacular-pack.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runPackCli(process.argv.slice(2), {
    readManifest: readManifestFromDisk,
    createReader: createNodePackReader,
    writeReport: writeReportToDisk,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((cause) => {
      // Defensive: runPackCli returns codes and does not reject, so this signals an
      // unexpected internal fault, not a usage error.
      console.error(cause)
      process.exitCode = EXIT_INTERNAL
    })
}
