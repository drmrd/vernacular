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
