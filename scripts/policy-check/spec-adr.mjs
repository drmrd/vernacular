/** @typedef {import('./rule-severity.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').ChangedFile} ChangedFile */

const SPEC_DIRECTORY = 'docs/specs/'
const ADR_PATH = /^docs\/knowledge\/decisions\/ADR-\d{4}-[^/]+\.md$/
const ADR_STATUSES = new Set(['A', 'M', 'R'])
const ADDED_STATUS = 'A'

/**
 * One finding when a spec is modified, renamed, or deleted and no ADR is added or modified.
 * A newly added spec needs no ADR.
 * @param {readonly ChangedFile[]} changedFiles
 * @returns {Finding[]}
 */
export function specNeedsAdrFindings(changedFiles) {
  const specPaths = changedFiles
    .filter((changed) => changed.status !== ADDED_STATUS)
    .map(specPathOf)
    .filter((path) => path !== undefined)
  if (specPaths.length === 0 || changedFiles.some(isAdrChange)) return []
  return [
    {
      rule: 'spec-needs-adr',
      file: specPaths[0],
      message: `A change to ${specPaths.join(', ')} needs an added or modified ADR under docs/knowledge/decisions/.`,
    },
  ]
}

/**
 * @param {ChangedFile} changed
 * @returns {string | undefined} the path of the change inside docs/specs, if any
 */
function specPathOf(changed) {
  return [changed.path, changed.previousPath ?? ''].find((path) => path.startsWith(SPEC_DIRECTORY))
}

/**
 * @param {ChangedFile} changed
 * @returns {boolean}
 */
function isAdrChange(changed) {
  return ADR_STATUSES.has(changed.status) && ADR_PATH.test(changed.path)
}
