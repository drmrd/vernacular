const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

// Node's default 1 MiB output limit is below the largest pull request diff in this repository.
export const GIT_OUTPUT_LIMIT_BYTES = 67_108_864 // 64 MiB

/** @typedef {(path: string) => string} ReadFile */
/** @typedef {(args: readonly string[]) => string} RunGit */
/** @typedef {{ sha: string, authorName: string, authorEmail: string, subject: string, message: string }} PolicyCommit */

/**
 * Parse `git log --format=%x1e%H%x1f%an%x1f%ae%x1f%B` output.
 * @param {string} raw
 * @returns {PolicyCommit[]}
 */
export function parseCommitLog(raw) {
  return raw
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim() !== '')
    .map(parseCommitRecord)
}

/**
 * @param {string} record
 * @returns {PolicyCommit}
 */
function parseCommitRecord(record) {
  const [sha, authorName, authorEmail, ...messageParts] = record.split(FIELD_SEPARATOR)
  const message = messageParts.join(FIELD_SEPARATOR).trimEnd()
  const [subject] = message.split('\n')
  return { sha, authorName, authorEmail, subject, message }
}

/** @typedef {{ file: string, line: number, text: string }} AddedLine */
/** @typedef {{ status: string, path: string, previousPath?: string }} ChangedFile */

/**
 * @typedef {object} DiffHunkLine
 * @property {string | null} oldFile path from the `--- ` header, null for `/dev/null`
 * @property {string | null} newFile path from the `+++ ` header, null for `/dev/null`
 * @property {number} newLine new-file line number of a `+` line; for a `-` line, the new-file line the removal precedes
 * @property {'+' | '-'} sign
 * @property {string} text the line without its sign
 */

const DIFF_FILE_START = 'diff --git '
const NULL_FILE = '/dev/null'
const FILE_HEADERS = [
  { side: 'old', marker: '--- ', prefix: 'a/' },
  { side: 'new', marker: '+++ ', prefix: 'b/' },
]
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Walk `git diff --unified=0` output and yield every added or removed line with its file context.
 * @param {string} raw
 * @returns {Generator<DiffHunkLine>}
 */
export function* diffHunkLines(raw) {
  let files = { old: null, new: null }
  let inHunk = false
  let newLine = 0
  for (const diffLine of raw.split('\n')) {
    const header = inHunk ? null : readFileHeader(diffLine)
    if (diffLine.startsWith(DIFF_FILE_START)) {
      files = { old: null, new: null }
      inHunk = false
    } else if (header !== null) {
      files = { ...files, [header.side]: header.path }
    } else if (HUNK_HEADER.test(diffLine)) {
      inHunk = true
      newLine = Number(HUNK_HEADER.exec(diffLine)[1])
    } else if (inHunk) {
      const sign = hunkLineSign(diffLine)
      if (sign === null) continue
      yield { oldFile: files.old, newFile: files.new, newLine, sign, text: diffLine.slice(1) }
      if (sign === '+') newLine += 1
    }
  }
}

/**
 * @param {string} diffLine
 * @returns {{ side: 'old' | 'new', path: string | null } | null} the side a `--- ` or `+++ ` line names, or null for any other line
 */
function readFileHeader(diffLine) {
  const header = FILE_HEADERS.find(({ marker }) => diffLine.startsWith(marker))
  if (header === undefined) return null
  const path = diffLine.slice(header.marker.length).replace(/\t$/, '')
  if (path === NULL_FILE) return { side: header.side, path: null }
  const stripped = path.startsWith(header.prefix) ? path.slice(header.prefix.length) : path
  return { side: header.side, path: stripped }
}

/**
 * @param {string} diffLine a line inside a hunk
 * @returns {'+' | '-' | null} null for context and `\ No newline at end of file` lines
 */
function hunkLineSign(diffLine) {
  const sign = diffLine[0]
  return sign === '+' || sign === '-' ? sign : null
}

/**
 * Parse `git diff --unified=0` output into the lines it adds.
 * @param {string} raw
 * @returns {AddedLine[]}
 */
export function parseUnifiedDiff(raw) {
  /** @type {AddedLine[]} */
  const addedLines = []
  for (const { newFile, newLine, sign, text } of diffHunkLines(raw)) {
    if (sign === '+' && newFile !== null) addedLines.push({ file: newFile, line: newLine, text })
  }
  return addedLines
}

/**
 * Parse `git diff --name-status` output.
 * @param {string} raw
 * @returns {ChangedFile[]}
 */
export function parseNameStatus(raw) {
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [code, firstPath, secondPath] = line.split('\t')
      const status = code[0]
      if (secondPath === undefined) return { status, path: firstPath }
      return { status, path: secondPath, previousPath: firstPath }
    })
}
