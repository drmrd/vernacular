/**
 * Builds the incremental Stryker runs that mutate only the lines a GREEN commit added.
 */

/** @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine */
/** @typedef {'app'|'tooling'} StrykerGroup */
/** @typedef {{ group: StrykerGroup, ranges: string[] }} RangeGroup */
/** @typedef {{ group: StrykerGroup, ranges: string[], vitestConfigFile: string, reportFile: string }} StrykerRequest */

const MUTATED_FOLDERS = ['core/', 'storage/', 'session/', 'scripts/']
const TOOLING_FOLDER = 'scripts/'
const BROWSER_TESTS_GLOB = '**/*.browser.test.ts'

/**
 * @param {AddedLine[]} covered
 * @returns {AddedLine[]}
 */
export function mutationTargets(covered) {
  return covered.filter((added) => MUTATED_FOLDERS.some((folder) => added.file.startsWith(folder)))
}

/**
 * @param {AddedLine} first
 * @param {AddedLine} second
 * @returns {number}
 */
function byFileThenLine(first, second) {
  if (first.file !== second.file) return first.file < second.file ? -1 : 1
  return first.line - second.line
}

/**
 * @param {AddedLine[]} lines
 * @returns {string[]}
 */
export function mutateRanges(lines) {
  const ranges = []
  let current = null
  for (const added of [...lines].sort(byFileThenLine)) {
    if (current && current.file === added.file && added.line <= current.end + 1) {
      current.end = Math.max(current.end, added.line)
    } else {
      current = { file: added.file, start: added.line, end: added.line }
      ranges.push(current)
    }
  }
  return ranges.map(({ file, start, end }) => `${file}:${start}-${end}`)
}

/**
 * @param {string[]} ranges
 * @returns {RangeGroup[]}
 */
export function strykerGroups(ranges) {
  const tooling = ranges.filter((range) => range.startsWith(TOOLING_FOLDER))
  const app = ranges.filter((range) => !range.startsWith(TOOLING_FOLDER))
  return [
    { group: /** @type {StrykerGroup} */ ('app'), ranges: app },
    { group: /** @type {StrykerGroup} */ ('tooling'), ranges: tooling },
  ].filter((entry) => entry.ranges.length > 0)
}

/**
 * @param {object} base the parsed `stryker.conf.json`
 * @param {StrykerRequest} request
 * @returns {object}
 */
export function strykerConfig(base, request) {
  const { tsconfigFile: _dropped, ...rest } = /** @type {Record<string, any>} */ (base)
  const config = {
    ...rest,
    mutate: request.ranges,
    vitest: { configFile: request.vitestConfigFile, related: false },
    reporters: ['json'],
    jsonReporter: { fileName: request.reportFile },
    thresholds: { ...rest.thresholds, break: null },
    incremental: false,
  }
  if (request.group === 'tooling') return { ...config, checkers: [] }
  return { ...config, checkers: ['typescript'], tsconfigFile: 'tsconfig.stryker.json' }
}

/**
 * @param {string[]} testFiles repository paths of the RED test files
 * @returns {string}
 */
export function redVitestConfigText(testFiles) {
  return [
    "import { mergeConfig } from 'vitest/config'",
    "import base from '../vite.config.ts'",
    '',
    'export default mergeConfig(base, {',
    '  test: {',
    `    include: ${JSON.stringify(testFiles)},`,
    `    exclude: ['${BROWSER_TESTS_GLOB}'],`,
    '  },',
    '})',
    '',
  ].join('\n')
}
