// scripts/rgb-audit/scope-rules.mjs
//
// Scope rules for the red-green-blue auditor: which paths a commit role may touch.

import { isTestAsset } from './test-files.mjs'

/**
 * Test-scope rule: a RED commit must change only test assets.
 *
 * @param {{ sha: string, files: string[] }} commit
 * @returns {{ sha: string, rule: 'test-scope', message: string }|null}
 */
export function testScopeViolation(commit) {
  const offending = commit.files.filter((file) => !isTestAsset(file))
  if (offending.length === 0) {
    return null
  }
  return {
    sha: commit.sha,
    rule: 'test-scope',
    message: `RED commit ${commit.sha} changes non-test file(s): ${offending.join(', ')}`,
  }
}
