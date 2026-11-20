/** @typedef {import('./git-input.mjs').PolicyCommit} PolicyCommit */
/** @typedef {{ rule: string, message: string, sha?: string, file?: string, line?: number }} Finding */

const FORBIDDEN_TRAILER_LINE =
  /^\s*(?:co-authored-by|generated-by|assisted-by|[a-z0-9]+(?:-[a-z0-9]+)*-session)\s*:/i
const GENERATED_WITH_FOOTER = 'generated with [claude code]'

/**
 * One finding per message line that carries a co-author or AI-session trailer.
 * @param {PolicyCommit[]} commits
 * @returns {Finding[]}
 */
export function trailerFindings(commits) {
  return commits.flatMap((commit) =>
    commit.message
      .split('\n')
      .filter(isForbiddenTrailerLine)
      .map((line) => ({
        rule: 'forbidden-trailer',
        message: `Commit ${commit.sha.slice(0, 8)} carries a forbidden trailer: ${line.trim()}`,
        sha: commit.sha,
      })),
  )
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isForbiddenTrailerLine(line) {
  return FORBIDDEN_TRAILER_LINE.test(line) || line.toLowerCase().includes(GENERATED_WITH_FOOTER)
}
