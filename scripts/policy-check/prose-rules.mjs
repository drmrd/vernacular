import { fencedLineNumbers, withoutInlineCode } from './markdown-code.mjs'

/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').AddedLine} AddedLine */
/** @typedef {(path: string) => string} ReadFile */

const EM_DASH = '\u2014'
const PROSE_FILE = /\.(?:md|mdx|txt)$/
// Mirrors the plan's exempt list, even where PROSE_FILE already excludes a name.
const EXEMPT_NAMES = new Set(['CHANGELOG.md', 'LICENSE', 'NOTICE', 'CODE_OF_CONDUCT.md'])

/**
 * One warning per added prose line that carries an em-dash outside code.
 * @param {readonly AddedLine[]} addedLines
 * @param {ReadFile} readFile
 * @returns {Finding[]}
 */
export function emDashFindings(addedLines, readFile) {
  const findings = []
  for (const [file, lines] of proseLinesByFile(addedLines)) {
    const fenced = fencedLineNumbers(readFile(file))
    for (const added of lines) {
      if (fenced.has(added.line)) continue
      if (!withoutInlineCode(added.text).includes(EM_DASH)) continue
      findings.push({
        rule: 'em-dash',
        file,
        line: added.line,
        message: `Added prose carries an em-dash in ${file}:${added.line}; rewrite it with a comma, colon, or period`,
      })
    }
  }
  return findings
}

/**
 * @param {readonly AddedLine[]} addedLines
 * @returns {Map<string, AddedLine[]>}
 */
function proseLinesByFile(addedLines) {
  const linesByFile = new Map()
  for (const added of addedLines) {
    if (!isCheckedProse(added.file)) continue
    let lines = linesByFile.get(added.file)
    if (lines === undefined) {
      lines = []
      linesByFile.set(added.file, lines)
    }
    lines.push(added)
  }
  return linesByFile
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isCheckedProse(file) {
  const name = file.slice(file.lastIndexOf('/') + 1)
  return PROSE_FILE.test(file) && !EXEMPT_NAMES.has(name)
}
