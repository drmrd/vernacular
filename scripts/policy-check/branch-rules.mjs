import { BOT_IDENTITIES } from './identities.mjs'

/** @typedef {import('./commit-rules.mjs').Finding} Finding */

/**
 * At most one finding when the branch lacks a commit-type prefix or a bot prefix.
 * An unknown (empty) branch skips the rule.
 * @param {string} branch
 * @param {readonly string[]} commitTypes
 * @returns {Finding[]}
 */
export function branchFindings(branch, commitTypes) {
  if (branch === '' || hasAllowedPrefix(branch, commitTypes)) return []
  return [
    {
      rule: 'branch-prefix',
      message: `Branch "${branch}" must start with a commit type and a slash, such as feat/ or fix/`,
    },
  ]
}

/**
 * @param {string} branch
 * @param {readonly string[]} commitTypes
 * @returns {boolean}
 */
function hasAllowedPrefix(branch, commitTypes) {
  const startsWithBotPrefix = BOT_IDENTITIES.some((bot) => branch.startsWith(bot.branchPrefix))
  const startsWithCommitType = commitTypes.some(
    (type) => branch.startsWith(`${type}/`) && branch.length > type.length + 1,
  )
  return startsWithBotPrefix || startsWithCommitType
}
