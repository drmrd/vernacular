/**
 * Reads lcov line coverage and maps it onto the lines a GREEN commit added.
 */

/** @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine */
/** @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding */
/** @typedef {Map<string, Map<number, number>>} LineCoverage */

const SOURCE_PREFIX = 'SF:'
const LINE_PREFIX = 'DA:'
const RECORD_END = 'end_of_record'

/**
 * @param {string} path
 * @param {string} root
 * @returns {string}
 */
function repositoryPath(path, root) {
  const base = root.replace(/\/+$/, '')
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

/**
 * @param {string} entry the text after `DA:`
 * @returns {[number, number] | null}
 */
function readLineHit(entry) {
  const [lineText, countText] = entry.split(',')
  const line = Number(lineText)
  const count = Number(countText)
  return Number.isInteger(line) ? [line, Number.isFinite(count) ? count : 0] : null
}

/**
 * @param {string} raw lcov text
 * @param {string} root absolute worktree root
 * @returns {LineCoverage}
 */
export function parseLcov(raw, root) {
  /** @type {LineCoverage} */
  const coverage = new Map()
  /** @type {Map<number, number> | null} */
  let current = null
  for (const text of raw.split(/\r?\n/)) {
    const row = text.trim()
    if (row.startsWith(SOURCE_PREFIX)) {
      const key = repositoryPath(row.slice(SOURCE_PREFIX.length), root)
      current = coverage.get(key) ?? new Map()
      coverage.set(key, current)
    } else if (row.startsWith(LINE_PREFIX) && current) {
      const hit = readLineHit(row.slice(LINE_PREFIX.length))
      if (hit) current.set(hit[0], (current.get(hit[0]) ?? 0) + hit[1])
    } else if (row === RECORD_END) {
      current = null
    }
  }
  return coverage
}

/**
 * @param {AddedLine[]} lines
 * @param {LineCoverage} coverage
 * @returns {{ covered: AddedLine[], uncovered: AddedLine[], unrecorded: string[] }}
 */
export function splitByCoverage(lines, coverage) {
  /** @type {AddedLine[]} */
  const covered = []
  /** @type {AddedLine[]} */
  const uncovered = []
  /** @type {Set<string>} */
  const unrecorded = new Set()
  for (const added of lines) {
    const fileCoverage = coverage.get(added.file)
    if (!fileCoverage) {
      unrecorded.add(added.file)
      continue
    }
    const count = fileCoverage.get(added.line)
    if (count === undefined) continue
    ;(count > 0 ? covered : uncovered).push(added)
  }
  return { covered, uncovered, unrecorded: [...unrecorded] }
}

/**
 * @param {AddedLine[]} lines uncovered added lines
 * @param {string} sha
 * @param {string} rule
 * @returns {Finding[]}
 */
export function uncoveredLineFindings(lines, sha, rule) {
  return lines.map(({ file, line }) => ({
    rule,
    sha,
    file,
    line,
    message: 'added line is not run by the RED tests',
  }))
}
