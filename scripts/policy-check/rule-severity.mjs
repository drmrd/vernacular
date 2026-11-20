/** @typedef {'fail' | 'warn'} Severity */
/** @typedef {keyof typeof RULE_SEVERITY} RuleId */
/** @typedef {{ rule: RuleId, message: string, sha?: string, file?: string, line?: number }} Finding */

/** The one place that says whether a rule fails the run or only warns. */
export const RULE_SEVERITY = Object.freeze({
  'commit-message-format': 'fail',
  'forbidden-trailer': 'fail',
  'author-identity': 'fail',
  'fork-author-identity': 'warn',
  'branch-prefix': 'fail',
  'milestone-code': 'warn',
  'em-dash': 'warn',
  'spec-needs-adr': 'fail',
  'exact-pin': 'fail',
  'e2e-timing-or-focus': 'warn',
  ordering: 'fail',
  independence: 'fail',
  blue: 'fail',
  'test-scope': 'fail',
  'refactor-scope': 'fail',
})

/**
 * @param {string} rule
 * @returns {Severity}
 */
export function severityOf(rule) {
  if (!Object.hasOwn(RULE_SEVERITY, rule)) {
    throw new Error(`unknown policy rule: ${rule}`)
  }
  return RULE_SEVERITY[/** @type {keyof typeof RULE_SEVERITY} */ (rule)]
}
