/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').PolicyCommit} PolicyCommit */

const SHORT_CODE = /\b[A-Z]{1,2}\d{1,2}(?:\.\d+)?\b/
const NUMBERED_PHASE =
  /\b(?:[Pp]hase|[Ss]tage|[Ww]ave|[Mm]ilestone|[Ss]print|[Ll]ane|[Ss]lice)[\s_-]+(?:\d+[A-Za-z]?|[A-Z])\b/
const BRANCH_SHORT_CODE = /^[a-z]{1,2}\d{1,2}$/
const BRANCH_PHASE_WORDS = ['phase', 'stage', 'wave', 'milestone', 'sprint', 'lane', 'slice']
const BRANCH_PHASE_LABEL = /^(?:\d+[a-z]?|[a-z])$/

/**
 * One warning per commit subject that carries a milestone code, plus at most one for the branch.
 * @param {readonly PolicyCommit[]} commits
 * @param {string} branch
 * @returns {Finding[]}
 */
export function milestoneCodeFindings(commits, branch) {
  const findings = []
  for (const commit of commits) {
    const code = (commit.subject.match(SHORT_CODE) ?? commit.subject.match(NUMBERED_PHASE))?.[0]
    if (code === undefined) continue
    findings.push({
      rule: 'milestone-code',
      sha: commit.sha,
      message: `Subject "${commit.subject}" carries the milestone code "${code}"; describe the change in plain words`,
    })
  }
  const branchCode = findBranchCode(branch)
  if (branchCode !== undefined) {
    findings.push({
      rule: 'milestone-code',
      message: `Branch "${branch}" carries the milestone code "${branchCode}"; name the branch for what it changes`,
    })
  }
  return findings
}

/**
 * @param {string} branch
 * @returns {string | undefined} the offending text, if any
 */
function findBranchCode(branch) {
  const tokens = branch
    .split('/')
    .slice(1)
    .join('/')
    .split(/[-/_.]/)
  for (const [index, token] of tokens.entries()) {
    if (BRANCH_SHORT_CODE.test(token)) return token
    const label = tokens[index + 1]
    if (
      BRANCH_PHASE_WORDS.includes(token) &&
      label !== undefined &&
      BRANCH_PHASE_LABEL.test(label)
    ) {
      return `${token}-${label}`
    }
  }
  return undefined
}
