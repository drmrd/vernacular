#!/usr/bin/env node
// scripts/pack/vernacular-pack.mjs
//
// vernacular-pack CLI scaffold (design specification section 4.3; phase 0 deliverable).
// Subcommands: `validate <packDir>` and `build <packDir>`. For this scaffold, `build`
// performs the same validation and reports a summary; content-hash verification,
// thumbnail baking, and publishing are deferred to phase 3.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePackManifest } from './manifest-validation.mjs'

const EXIT_OK = 0
const EXIT_INVALID = 1
const EXIT_USAGE = 2
const EXIT_INTERNAL = 3
const USAGE = 'Usage: vernacular-pack <validate|build> <packDir>'

/**
 * @typedef {object} PackCliDeps
 * @property {(packDir: string) => Promise<unknown>} readManifest
 * @property {(message: string) => void} log
 * @property {(message: string) => void} error
 */

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
  const result = validatePackManifest(manifest)
  if (!result.valid) {
    deps.error(`Invalid pack manifest in ${packDir}:`)
    for (const message of result.errors) {
      deps.error(`  - ${message}`)
    }
    return EXIT_INVALID
  }
  deps.log(`${command}: ${packDir} manifest is valid`)
  return EXIT_OK
}

/** Read <packDir>/manifest.json from disk. */
async function readManifestFromDisk(packDir) {
  const raw = await readFile(join(packDir, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Run only when invoked directly (node scripts/pack/vernacular-pack.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runPackCli(process.argv.slice(2), {
    readManifest: readManifestFromDisk,
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
