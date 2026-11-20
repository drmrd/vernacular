/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').ChangedFile} ChangedFile */

const SPEC_DIRECTORY = 'docs/specs/'
const ADR_PATH = /^docs\/knowledge\/decisions\/ADR-\d{4}-[^/]+\.md$/
const ADR_STATUSES = new Set(['A', 'M', 'R'])

/**
 * One finding when a spec changes and no ADR is added or modified.
 * @param {readonly ChangedFile[]} changedFiles
 * @returns {Finding[]}
 */
export function specNeedsAdrFindings(changedFiles) {
  const specPaths = changedFiles.map(specPathOf).filter((path) => path !== undefined)
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
