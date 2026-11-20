// scripts/rgb-audit/scope-rules.mjs
//
// Scope rules for the red-green-blue auditor: which paths a commit role may touch.

import { isTestAsset, isTestFile } from './test-files.mjs'

const SECTION_HEADER_PATTERN = /^diff --git a\/.+? b\/(.+)$/
const PURE_RENAME_LINE = 'similarity index 100%'
const FILE_HEADER_PATTERN = /^(?:\+\+\+|---)(?: |$)/
const MODULE_SPECIFIER = String.raw`\s*['"][^'"]+['"];?\s*$`
const SINGLE_LINE_MODULE_STATEMENT = new RegExp(
  String.raw`^(?:import|export)\b.*\bfrom` + MODULE_SPECIFIER,
)
const BARE_FROM_LINE = new RegExp(String.raw`^\}?\s*from` + MODULE_SPECIFIER)
const OPEN_MODULE_STATEMENT = /^(?:import|export)\s+(?:type\s+)?\{[^}]*$/
const NAMES_LINE = /^[\w$,\s]+$/

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
 * belongs to an import or export statement.
 *
 * @param {string} diffText output of `git show -M --format= --unified=0 <sha>`
 * @returns {Set<string>}
 */
export function exemptTestFiles(diffText) {
  const exempt = new Set()
  for (const section of splitDiffSections(diffText)) {
    if (section.lines.includes(PURE_RENAME_LINE) || isImportOnlyChange(section.lines)) {
      exempt.add(section.path)
    }
  }
  return exempt
}

/**
 * Split a diff into one section for each file, keyed by the file's new path.
 *
 * @param {string} diffText
 * @returns {{ path: string, lines: string[] }[]}
 */
function splitDiffSections(diffText) {
  const sections = []
  for (const line of diffText.split('\n')) {
    const header = SECTION_HEADER_PATTERN.exec(line)
    if (header !== null) {
      sections.push({ path: header[1], lines: [] })
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line)
    }
  }
  return sections
}

/**
 * True when every added and removed line of a file's diff section is part of
 * an import or export statement. Added and removed lines each track their own
 * open multi-line statement.
 *
 * @param {string[]} sectionLines
 * @returns {boolean}
 */
function isImportOnlyChange(sectionLines) {
  const openStatement = { '+': false, '-': false }
  for (const line of sectionLines) {
    const sign = line[0]
    if ((sign !== '+' && sign !== '-') || FILE_HEADER_PATTERN.test(line)) {
      continue
    }
    const code = line.slice(1).trim()
    if (!isModuleStatementLine(code, openStatement[sign])) {
      return false
    }
    openStatement[sign] = continuesOpenStatement(code, openStatement[sign])
  }
  return true
}

/**
 * @param {string} code a changed line without its sign, trimmed
 * @param {boolean} insideStatement
 * @returns {boolean}
 */
function isModuleStatementLine(code, insideStatement) {
  if (SINGLE_LINE_MODULE_STATEMENT.test(code) || BARE_FROM_LINE.test(code)) {
    return true
  }
  if (OPEN_MODULE_STATEMENT.test(code)) {
    return true
  }
  return insideStatement && NAMES_LINE.test(code)
}

/**
 * Whether a multi-line import or export statement is still open after this line.
 *
 * @param {string} code
 * @param {boolean} insideStatement
 * @returns {boolean}
 */
function continuesOpenStatement(code, insideStatement) {
  if (OPEN_MODULE_STATEMENT.test(code)) {
    return true
  }
  return insideStatement && !BARE_FROM_LINE.test(code)
}
