const OPENING_FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/
const BACKTICK_RUN = /`+/g

/**
 * The 1-based numbers of the lines that are fence lines or sit inside a fenced block.
 * An unclosed fence runs to the end of the content.
 * @param {string} content
 * @returns {Set<number>}
 */
export function fencedLineNumbers(content) {
  const fenced = new Set()
  let openFence
  for (const [index, line] of content.split('\n').entries()) {
    const lineNumber = index + 1
    if (openFence === undefined) {
      const opening = line.match(OPENING_FENCE)?.[1]
      if (opening === undefined) continue
      openFence = { character: opening[0], length: opening.length }
      fenced.add(lineNumber)
      continue
    }
    fenced.add(lineNumber)
    const closing = line.match(CLOSING_FENCE)?.[1]
    if (closing?.[0] === openFence.character && closing.length >= openFence.length) {
      openFence = undefined
    }
  }
  return fenced
}

/**
 * The text with every inline code span (a backtick run, what it encloses, and the matching run)
 * removed. A backtick run with no matching run stays as literal text.
 * @param {string} text
 * @returns {string}
 */
export function withoutInlineCode(text) {
  const runs = [...text.matchAll(BACKTICK_RUN)]
  let result = ''
  let position = 0
  for (let index = 0; index < runs.length; index += 1) {
    const start = runs[index]
    if (start.index < position) continue
    const end = runs.slice(index + 1).find((run) => run[0].length === start[0].length)
    if (end === undefined) continue
    result += text.slice(position, start.index)
    position = end.index + end[0].length
  }
  return result + text.slice(position)
}
