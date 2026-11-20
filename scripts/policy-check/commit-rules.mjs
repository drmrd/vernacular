import { BOT_IDENTITIES, OWNER_IDENTITY } from './identities.mjs'

/** @typedef {import('./git-input.mjs').PolicyCommit} PolicyCommit */
/** @typedef {import('./rule-severity.mjs').Finding} Finding */

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
        message: `Forbidden trailer: ${line.trim()}`,
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

/**
 * One finding per commit whose author is neither the owner nor a bot on its own branch.
 * @param {PolicyCommit[]} commits
 * @param {string} branch
 * @returns {Finding[]}
 */
export function authorFindings(commits, branch) {
  return commits
    .filter((commit) => !isAllowedAuthor(commit, branch))
    .map((commit) => ({
      rule: 'author-identity',
      message: `Author ${commit.authorName} <${commit.authorEmail}> is not the owner identity`,
      sha: commit.sha,
    }))
}

/**
 * @param {PolicyCommit} commit
 * @param {string} branch
 * @returns {boolean}
 */
function isAllowedAuthor(commit, branch) {
  const isOwner =
    commit.authorName === OWNER_IDENTITY.name && commit.authorEmail === OWNER_IDENTITY.email
  const isBotOnItsBranch = BOT_IDENTITIES.some(
    (bot) => commit.authorEmail === bot.email && branch.startsWith(bot.branchPrefix),
  )
  return isOwner || isBotOnItsBranch
}
