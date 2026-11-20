const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

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
