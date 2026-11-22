import { diffHunkLines } from '../policy-check/git-input.mjs'
import { isTestAsset } from '../rgb-audit/test-files.mjs'

/** @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine */

const PROOF_SOURCE_EXTENSION = /\.(?:ts|tsx|mjs|js)$/
const GENERATED_VALIDATORS_FOLDER = 'core/format/generated/'

/**
 * Parse `git show --format= --unified=0` output into the text of each removed line.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseRemovedLines(raw) {
  return [...diffHunkLines(raw)]
    .filter(({ sign, oldFile }) => sign === '-' && oldFile !== null && isProofSource(oldFile))
    .map(({ text }) => text)
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
 * Whether a path is production source that the GREEN proof must cover: not a test asset, a declaration file,
 * or a generated schema validator. `pnpm schema:check` regenerates the validators and compares them with the
 * committed files, and they are minified one-line files that would flood the mutation check.
 * @param {string} path
 * @returns {boolean}
 */
export function isProofSource(path) {
  return (
    PROOF_SOURCE_EXTENSION.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.startsWith(GENERATED_VALIDATORS_FOLDER) &&
    !isTestAsset(path)
  )
}
