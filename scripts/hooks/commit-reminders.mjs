// scripts/hooks/commit-reminders.mjs
//
// Pure selection of advisory commit-time reminders from a set of staged file
// paths (CLAUDE.md workflow steps 6 and 10). No filesystem or process access:
// it takes repo-relative paths and returns the reminder strings to surface.
// A commit hook can print these without this module knowing how it does so.

const SOURCE_LAYER = /^(core|storage|engine|bridge|editor|app)\//
const DESIGN_SPEC = /^docs\/specs\//

const CLEAN_CODE_REMINDER =
  'Reminder: run /clean-code-review on this diff before opening a PR (the BLUE phase is non-optional).'
const KNOWLEDGE_REMINDER =
  'Reminder: consider whether this change needs a knowledge-graph (ADR) update.'

/**
 * Select advisory reminder strings for a set of staged file paths.
 * @param {string[]} paths repo-relative staged file paths
 * @returns {string[]} reminder strings, clean-code first when present
 */
export function reminderMessages(paths) {
  const touchesSource = paths.some((path) => SOURCE_LAYER.test(path))
  const touchesSpec = paths.some((path) => DESIGN_SPEC.test(path))
  const messages = []
  if (touchesSource) {
    messages.push(CLEAN_CODE_REMINDER)
  }
  if (touchesSource || touchesSpec) {
    messages.push(KNOWLEDGE_REMINDER)
  }
  return messages
}
