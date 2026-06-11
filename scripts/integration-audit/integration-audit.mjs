#!/usr/bin/env node
// scripts/integration-audit/integration-audit.mjs
//
// integration-audit CLI: verify that every capability the journey coverage
// matrix marks "required" has a matching journey test, so a feature cannot be
// considered done until a test proves it is reachable from the assembled editor.
// The dependency-injected core takes the parsed matrix and the journey test
// titles; the CLI at the bottom wires the real filesystem. Exit code 0 means
// clean; 1 means at least one required capability is missing its test.

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EXIT_CLEAN = 0
const EXIT_VIOLATIONS = 1
const EXIT_INTERNAL = 2
const MATRIX_PATH = 'e2e/journey-coverage.json'
const JOURNEYS_DIR = 'e2e/tests/journeys'
const TEST_TITLE = /\btest\s*\(\s*(['"`])([^'"`]+)\1/g
const TITLE_GROUP = 2

/**
 * @typedef {object} Capability
 * @property {string} id
 * @property {string} title the exact journey test title that proves it
 * @property {'required' | 'pending'} status
 */

/**
 * @typedef {object} IntegrationAuditDeps
 * @property {() => Promise<{ capabilities: Capability[] }>} readMatrix
 * @property {() => Promise<string[]>} readJourneyTitles
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} _argv
 * @param {IntegrationAuditDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runIntegrationAudit(_argv, { readMatrix, readJourneyTitles, log }) {
  const { capabilities } = await readMatrix()
  const titles = new Set(await readJourneyTitles())
  const required = capabilities.filter((capability) => capability.status === 'required')
  const pending = capabilities.filter((capability) => capability.status === 'pending')
  const missing = required.filter((capability) => !titles.has(capability.title))

  if (missing.length === 0) {
    log(
      `integration-audit: clean. ${required.length} required capabilities covered, ${pending.length} pending.`,
    )
    return EXIT_CLEAN
  }
  log(`integration-audit: ${missing.length} required capability(ies) missing a journey test:`)
  for (const capability of missing) {
    log(`  - ${capability.id}: no journey test titled "${capability.title}"`)
  }
  return EXIT_VIOLATIONS
}

// Collect every Playwright test title declared under the journeys directory.
async function realJourneyTitles() {
  const entries = await readdir(JOURNEYS_DIR)
  const specs = entries.filter((name) => name.endsWith('.spec.ts'))
  const titles = []
  for (const spec of specs) {
    const source = await readFile(path.join(JOURNEYS_DIR, spec), 'utf8')
    for (const match of source.matchAll(TEST_TITLE)) {
      titles.push(match[TITLE_GROUP])
    }
  }
  return titles
}

async function realMatrix() {
  return JSON.parse(await readFile(MATRIX_PATH, 'utf8'))
}

// Run the audit against the real filesystem when invoked directly, never when
// imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runIntegrationAudit(process.argv.slice(2), {
    readMatrix: realMatrix,
    readJourneyTitles: realJourneyTitles,
    log: (line) => console.log(line),
  })
    .then((code) => {
      // Set, don't exit: let queued async work and beforeExit handlers drain.
      process.exitCode = code
    })
    .catch((error) => {
      // Defensive: runIntegrationAudit returns codes and does not reject, so this
      // signals an unexpected internal fault, not a violation verdict.
      console.error(error)
      process.exit(EXIT_INTERNAL)
    })
}
