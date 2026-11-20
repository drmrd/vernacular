// scripts/rgb-audit/scope-rules.mjs
//
// Scope rules for the red-green-blue auditor: which paths a commit role may touch.

import { isModuleOrCommentOnlyChange, isPureRename, splitDiffSections } from './commit-diff.mjs'
import { isTestAsset, isTestFile } from './test-files.mjs'

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

/**
 * Refactor-scope rule: a BLUE commit must change no test files, except test
 * files whose diff only follows a rename or a move (see `exemptTestFiles`).
 * Without a diff reader no exemption applies.
 *
 * @param {{ sha: string, files: string[] }} commit
 * @param {((sha: string) => string)|undefined} readCommitDiff
 * @returns {{ sha: string, rule: 'refactor-scope', message: string }|null}
 */
export function refactorScopeViolation(commit, readCommitDiff) {
  const testFiles = commit.files.filter((file) => isTestFile(file))
  if (testFiles.length === 0) {
    return null
  }
  const exempt =
    readCommitDiff === undefined ? new Set() : exemptTestFiles(readCommitDiff(commit.sha))
  const offending = testFiles.filter((file) => !exempt.has(file))
  if (offending.length === 0) {
    return null
  }
  return {
    sha: commit.sha,
    rule: 'refactor-scope',
    message: `BLUE commit ${commit.sha} modifies test file(s): ${offending.join(', ')}`,
  }
}

/**
 * The new paths of the files in a rename-aware diff whose change only follows a
 * rename or a move: a pure rename, or a diff whose every added and removed line
 * is a comment line or belongs to an import or export statement.
 *
 * @param {string} diffText output of `git show -M --format= --unified=0 <sha>`
 * @returns {Set<string>}
 */
export function exemptTestFiles(diffText) {
  const exempt = new Set()
  for (const section of splitDiffSections(diffText)) {
    if (isPureRename(section.lines) || isModuleOrCommentOnlyChange(section.lines)) {
      exempt.add(section.path)
    }
  }
  return exempt
}
