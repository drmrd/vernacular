// scripts/rgb-audit/commit-diff.mjs
//
// Reads the unified diff of one commit (`git show -M --format= --unified=0`):
// per-file sections, rename headers, and import, export, and comment line classification.

const SECTION_HEADER_PATTERN = /^diff --git a\/.+? b\/(.+)$/
const PURE_RENAME_LINE = 'similarity index 100%'
const HUNK_HEADER_PREFIX = '@@'
const MODULE_SPECIFIER = String.raw`\s*['"][^'"]+['"];?\s*$`
const SINGLE_LINE_MODULE_STATEMENT = new RegExp(
  String.raw`^(?:import|export)\b.*\bfrom` + MODULE_SPECIFIER,
)
const BARE_FROM_LINE = new RegExp(String.raw`^\}?\s*from` + MODULE_SPECIFIER)
const OPEN_MODULE_STATEMENT = /^(?:import|export)\s+(?:type\s+)?\{[^}]*$/
const NAMES_LINE = /^[\w$,\s]+$/
const LINE_COMMENT_PREFIX = '//'
const BLOCK_COMMENT_OPEN = '/*'
const BLOCK_COMMENT_CLOSE = '*/'
const TOOL_DIRECTIVE =
  /^\/\/\s*(?:@vitest-environment\b|eslint-(?:disable|enable)\b|@ts-|prettier-ignore\b)/
const NOT_COMMENT = 'not-comment'
const COMMENT_BLOCK_OPEN = 'comment-block-open'
const COMMENT_BLOCK_CLOSED = 'comment-block-closed'

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
 * True when every added and removed line of a file's diff section is a whole-line comment
 * or part of an import or export statement. Added and removed lines each track their own
 * open multi-line statement, and each hunk starts with both closed. Lines
 * before the first hunk header are file headers, not changes.
 *
 * @param {string[]} sectionLines
 * @returns {boolean}
 */
export function isModuleOrCommentOnlyChange(sectionLines) {
  let state = closedStates()
  let insideHunk = false
  for (const line of sectionLines) {
    if (line.startsWith(HUNK_HEADER_PREFIX)) {
      state = closedStates()
      insideHunk = true
      continue
    }
    const sign = line[0]
    if (!insideHunk || (sign !== '+' && sign !== '-')) {
      continue
    }
    if (!acceptChangedLine(line.slice(1).trim(), state[sign])) {
      return false
    }
  }
  return true
}

function closedStates() {
  return {
    '+': { statement: false, block: false },
    '-': { statement: false, block: false },
  }
}

/**
 * Judge one changed line and advance the open comment block and open statement of its sign.
 *
 * @param {string} code a changed line without its sign, trimmed
 * @param {{ statement: boolean, block: boolean }} state
 * @returns {boolean} whether the line is a whole comment line or part of a module statement
 */
function acceptChangedLine(code, state) {
  const comment = scanComment(code, state.block)
  if (comment !== NOT_COMMENT) {
    state.block = comment === COMMENT_BLOCK_OPEN
    return true
  }
  if (!isModuleStatementLine(code, state.statement)) {
    return false
  }
  state.statement = continuesOpenStatement(code, state.statement)
  return true
}

/**
 * Classify a line as comment text only when the whole line is comment.
 *
 * @param {string} code
 * @param {boolean} insideBlock
 * @returns {string} NOT_COMMENT, COMMENT_BLOCK_OPEN, or COMMENT_BLOCK_CLOSED
 */
function scanComment(code, insideBlock) {
  if (!insideBlock && code.startsWith(LINE_COMMENT_PREFIX)) {
    return TOOL_DIRECTIVE.test(code) ? NOT_COMMENT : COMMENT_BLOCK_CLOSED
  }
  if (!insideBlock && !code.startsWith(BLOCK_COMMENT_OPEN)) {
    return NOT_COMMENT
  }
  const searchFrom = insideBlock ? 0 : BLOCK_COMMENT_OPEN.length
  const closeIndex = code.indexOf(BLOCK_COMMENT_CLOSE, searchFrom)
  if (closeIndex === -1) {
    return COMMENT_BLOCK_OPEN
  }
  const rest = code.slice(closeIndex + BLOCK_COMMENT_CLOSE.length)
  return rest.trim() === '' ? COMMENT_BLOCK_CLOSED : NOT_COMMENT
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
