/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').AddedLine} AddedLine */

const E2E_FILE = /^e2e\/.*\.(?:ts|tsx|mjs)$/
const COMMENT_START = /^(?:\/\/|\*)/

const E2E_PATTERNS = [
  {
    pattern: /\bwaitForTimeout\s*\(/,
    message: 'waitForTimeout waits a fixed time; wait for an observable condition instead',
  },
  {
    pattern: /\bsleep\s*\(/,
    message: 'sleep waits a fixed time; wait for an observable condition instead',
  },
  {
    pattern: /(?:^|[^.\w$])setTimeout\s*\(|\b(?:window|globalThis|self)\.setTimeout\s*\(/,
    message: 'setTimeout waits a fixed time; wait for an observable condition instead',
  },
  {
    pattern: /\b(?:test|it|describe)(?:\.describe)?\.only\s*\(/,
    message: 'A focused test (.only) skips the rest of the suite; remove it before merging',
  },
  {
    pattern: /\b(?:test|it|describe)(?:\.describe)?\.skip\s*\(\s*(?:['"`]|\))/,
    message: 'A static skip hides a test; fix it, delete it, or skip on a condition',
  },
]

/**
 * One warning per added e2e line that waits a fixed time, focuses a test, or skips one statically.
 * @param {readonly AddedLine[]} addedLines
 * @returns {Finding[]}
 */
export function e2eTimingFindings(addedLines) {
  const findings = []
  for (const added of addedLines) {
    if (!E2E_FILE.test(added.file)) continue
    if (COMMENT_START.test(added.text.trim())) continue
    for (const { pattern, message } of E2E_PATTERNS) {
      if (!pattern.test(added.text)) continue
      findings.push({ rule: 'e2e-timing-or-focus', file: added.file, line: added.line, message })
    }
  }
  return findings
}
