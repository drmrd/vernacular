// scripts/green-proof/test-set.mjs
//
// Which files of a GREEN commit's RED commits count as unit tests.

import { isTestAsset, isTestFile } from '../rgb-audit/test-files.mjs'

/** @typedef {import('../rgb-audit/cycle-pairing.mjs').GreenCycle} GreenCycle */
/** @typedef {'unit'|'mixed'|'other-only'|'assets-only'|'empty'} RedSetKind */
/** @typedef {{ kind: RedSetKind, unitFiles: string[], otherFiles: string[], assetFiles: string[] }} RedTestSet */

const BROWSER_TEST_PATTERN = /\.browser\.test\.ts$/
const OTHER_TEST_PATTERNS = [/\.spec\.tsx?$/, /\.stories\.tsx$/]

/**
 * True when the path is a unit test file: a test file that is neither an
 * end-to-end file nor a browser test.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isUnitTestFile(path) {
  return isTestFile(path) && !path.startsWith('e2e/') && !BROWSER_TEST_PATTERN.test(path)
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isOtherTestFile(path) {
  if (isUnitTestFile(path)) return false
  return isTestFile(path) || OTHER_TEST_PATTERNS.some((pattern) => pattern.test(path))
}

/**
 * @param {string[]} unitFiles
 * @param {string[]} otherFiles
 * @param {string[]} assetFiles
 * @returns {RedSetKind}
 */
function classifyKind(unitFiles, otherFiles, assetFiles) {
  if (unitFiles.length > 0) return otherFiles.length > 0 ? 'mixed' : 'unit'
  if (otherFiles.length > 0) return 'other-only'
  return assetFiles.length > 0 ? 'assets-only' : 'empty'
}

/**
 * The union of the RED commits' files that still exist at the GREEN commit,
 * sorted and without duplicates, split by role.
 *
 * @param {GreenCycle} cycle
 * @param {(path: string) => boolean} existsAtGreen
 * @returns {RedTestSet}
 */
export function redTestSet(cycle, existsAtGreen) {
  const paths = new Set(cycle.reds.flatMap((red) => red.files))
  const present = [...paths].filter(existsAtGreen).sort()
  const unitFiles = present.filter(isUnitTestFile)
  const otherFiles = present.filter(isOtherTestFile)
  const assetFiles = present.filter(
    (path) => isTestAsset(path) && !isUnitTestFile(path) && !isOtherTestFile(path),
  )
  return {
    kind: classifyKind(unitFiles, otherFiles, assetFiles),
    unitFiles,
    otherFiles,
    assetFiles,
  }
}
