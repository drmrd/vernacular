const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

// Node's default 1 MiB output limit is below the largest pull request diff in this repository.
export const GIT_OUTPUT_LIMIT_BYTES = 67_108_864 // 64 MiB

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

const DIFF_FILE_START = 'diff --git '
const NEW_FILE_MARKER = '+++ '
const NULL_FILE = '/dev/null'
const NEW_FILE_PREFIX = 'b/'
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Parse `git diff --unified=0` output into the lines it adds.
 * @param {string} raw
 * @returns {AddedLine[]}
 */
export function parseUnifiedDiff(raw) {
  /** @type {AddedLine[]} */
  const addedLines = []
  let file = null
  let inHunk = false
  let nextLine = 0
  for (const diffLine of raw.split('\n')) {
    if (diffLine.startsWith(DIFF_FILE_START)) {
      file = null
      inHunk = false
    } else if (!inHunk && diffLine.startsWith(NEW_FILE_MARKER)) {
      file = readNewFilePath(diffLine)
    } else if (HUNK_HEADER.test(diffLine)) {
      inHunk = true
      nextLine = Number(HUNK_HEADER.exec(diffLine)[1])
    } else if (inHunk && file !== null && diffLine.startsWith('+')) {
      addedLines.push({ file, line: nextLine, text: diffLine.slice(1) })
      nextLine += 1
    }
  }
  return addedLines
}

/**
 * @param {string} headerLine a `+++ ` line from a file header
 * @returns {string | null} the new path, or null for a deleted file
 */
function readNewFilePath(headerLine) {
  const path = headerLine.slice(NEW_FILE_MARKER.length).replace(/\t$/, '')
  if (path === NULL_FILE) return null
  return path.startsWith(NEW_FILE_PREFIX) ? path.slice(NEW_FILE_PREFIX.length) : path
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
