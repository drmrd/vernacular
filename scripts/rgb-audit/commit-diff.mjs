// scripts/rgb-audit/commit-diff.mjs
//
// Reads the unified diff of one commit (`git show -M --format= --unified=0`):
// per-file sections, rename headers, and import or export line classification.

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
 * Split a diff into one section for each file, keyed by the file's new path.
 *
 * @param {string} diffText
 * @returns {{ path: string, lines: string[] }[]}
 */
export function splitDiffSections(diffText) {
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
export function isImportOnlyChange(sectionLines) {
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

/**
 * @param {string[]} sectionLines
 * @returns {boolean}
 */
export function isPureRename(sectionLines) {
  return sectionLines.includes(PURE_RENAME_LINE)
}
