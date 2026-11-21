import { isTestAsset } from '../rgb-audit/test-files.mjs'

/** @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine */

const DIFF_FILE_START = 'diff --git '
const OLD_SIDE_HEADER = '--- a/'
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/
const PROOF_SOURCE_EXTENSION = /\.(?:ts|tsx|mjs|js)$/

/**
 * Parse `git show --format= --unified=0` output into the text of each removed line.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseRemovedLines(raw) {
  /** @type {string[]} */
  const removedLines = []
  let inHunk = false
  let countsRemoved = false
  for (const diffLine of raw.split('\n')) {
    if (diffLine.startsWith(DIFF_FILE_START)) {
      inHunk = false
      countsRemoved = false
    } else if (HUNK_HEADER.test(diffLine)) {
      inHunk = true
    } else if (inHunk) {
      if (countsRemoved && diffLine.startsWith('-')) removedLines.push(diffLine.slice(1))
    } else if (diffLine.startsWith(OLD_SIDE_HEADER)) {
      countsRemoved = isProofSource(diffLine.slice(OLD_SIDE_HEADER.length))
    }
  }
  return removedLines
}

/**
 * Drop the added lines that are moved: equal, ignoring indentation, to a removed line not yet used.
 * @param {AddedLine[]} added
 * @param {string[]} removed
 * @returns {AddedLine[]}
 */
export function provableAddedLines(added, removed) {
  /** @type {Map<string, number>} */
  const unusedRemoved = new Map()
  for (const text of removed) {
    const key = text.trim()
    unusedRemoved.set(key, (unusedRemoved.get(key) ?? 0) + 1)
  }
  return added.filter((line) => {
    const key = line.text.trim()
    const remaining = unusedRemoved.get(key) ?? 0
    if (remaining === 0) return true
    unusedRemoved.set(key, remaining - 1)
    return false
  })
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isProofSource(path) {
  return PROOF_SOURCE_EXTENSION.test(path) && !path.endsWith('.d.ts') && !isTestAsset(path)
}
