// scripts/rgb-audit/cycle-pairing.mjs
//
// Pairs each GREEN commit with the pool of RED commits that precede it, using
// the role rules of `cycle-audit.mjs`. The pool matches the one `auditCommits`
// consumes: the RED commits since the previous GREEN commit. BLUE and exempt
// commits neither add to nor clear it.

import { classify } from './cycle-audit.mjs'

/**
 * @typedef {import('./cycle-audit.mjs').ParsedCommit} ParsedCommit
 * @typedef {{ green: ParsedCommit, reds: ParsedCommit[] }} GreenCycle
 */

/**
 * Pair each GREEN commit with its RED pool, in order.
 *
 * @param {ParsedCommit[]} commits oldest first
 * @returns {GreenCycle[]}
 */
export function pairGreenCycles(commits) {
  /** @type {GreenCycle[]} */
  const cycles = []
  let pool = []
  for (const commit of commits) {
    const role = classify(commit)
    if (role === 'red') {
      pool.push(commit)
    } else if (role === 'green') {
      cycles.push({ green: commit, reds: pool })
      pool = []
    }
  }
  return cycles
}
