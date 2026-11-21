const RECORD_SEPARATOR = '\x1e'
const UNIT_SEPARATOR = '\x1f'

/** One commit as `git log` prints it for the audit: a header line, then its files. */
export function record({ sha, subject, infra = '', files = [] }) {
  const header = [sha, subject, infra].join(UNIT_SEPARATOR)
  return [header, ...files].join('\n')
}

/** Join commit records into the raw `git log` text that `parseGitLog` reads. */
export function gitLog(records) {
  return records.map(record).join(RECORD_SEPARATOR)
}
