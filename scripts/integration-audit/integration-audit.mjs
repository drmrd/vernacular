#!/usr/bin/env node
// scripts/integration-audit/integration-audit.mjs
//
// integration-audit CLI: verify that every capability the journey coverage
// matrix marks "required" has a matching journey test, so a feature cannot be
// considered done until a test proves it is reachable from the assembled editor.
// The dependency-injected core takes the parsed matrix and the journey test
// titles; the CLI at the bottom wires the real filesystem. Exit code 0 means
// clean; 1 means at least one required capability is missing its test.

const EXIT_CLEAN = 0
const EXIT_VIOLATIONS = 1

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
