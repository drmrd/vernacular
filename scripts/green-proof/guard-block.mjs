/**
 * Finds the direct-invocation block of a script: the top-level `if` that runs the command only
 * when Node starts the file itself. No unit test can reach its body.
 */

/**
 * @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine
 */

const URL_MARKER = 'import.meta.url'
const CONST_PATTERN = /^const ([A-Za-z_$][\w$]*) =(.*)$/
const IF_PREFIX = 'if ('

/**
 * @param {string[]} lines
 * @param {number} start the index of the first continuation line
 * @returns {string} the continuation lines of an initializer: indented lines up to a blank or column 0 line
 */
function continuationText(lines, start) {
  const continuation = []
  for (let index = start; index < lines.length && lines[index].startsWith(' '); index += 1) {
    continuation.push(lines[index])
  }
  return continuation.join('\n')
}

/**
 * @param {string[]} lines
 * @returns {string[]} the names of top-level consts whose initializer contains `import.meta.url`
 */
function guardNames(lines) {
  const names = []
  lines.forEach((text, index) => {
    const match = CONST_PATTERN.exec(text)
    if (match === null) return
    const initializer = `${match[2]}\n${continuationText(lines, index + 1)}`
    if (initializer.includes(URL_MARKER)) names.push(match[1])
  })
  return names
}

/**
 * @param {string} condition
 * @param {string} name
 * @returns {boolean} whether the name occurs in the condition as a whole word
 */
function hasWholeWord(condition, name) {
  const escaped = name.replaceAll('$', '\\$')
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(condition)
}

/**
 * @param {string} text
 * @param {string[]} names
 * @returns {boolean}
 */
function isGuardHeader(text, names) {
  if (!text.startsWith(IF_PREFIX) || !text.trimEnd().endsWith('{')) return false
  const condition = text.slice(IF_PREFIX.length, text.lastIndexOf(')'))
  return condition.includes(URL_MARKER) || names.some((name) => hasWholeWord(condition, name))
}

/**
 * @param {string} source
 * @returns {Set<number>} the 1-based numbers of every line in a direct-invocation block, the `if` and closing brace included
 */
export function guardBlockLines(source) {
  const lines = source.split('\n')
  const names = guardNames(lines)
  /** @type {Set<number>} */
  const block = new Set()
  lines.forEach((text, index) => {
    if (!isGuardHeader(text, names)) return
    const end = lines.findIndex((later, laterIndex) => laterIndex > index && later.startsWith('}'))
    for (let at = index; end !== -1 && at <= end; at += 1) block.add(at + 1)
  })
  return block
}

/**
 * @param {AddedLine[]} lines
 * @param {(file: string) => string} readSource called once per distinct file of `lines`
 * @returns {{ guard: AddedLine[], other: AddedLine[] }} both lists keep the input order
 */
export function splitGuardLines(lines, readSource) {
  /** @type {Map<string, Set<number>>} */
  const blocks = new Map()
  const guard = []
  const other = []
  for (const added of lines) {
    if (!blocks.has(added.file)) blocks.set(added.file, guardBlockLines(readSource(added.file)))
    const inBlock = blocks.get(added.file)?.has(added.line) === true
    if (inBlock) guard.push(added)
    else other.push(added)
  }
  return { guard, other }
}
