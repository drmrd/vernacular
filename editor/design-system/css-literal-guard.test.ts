import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Behavior 14a of 14: the design system owns every corner radius. Editor CSS
// must reach for a --radius-* token rather than a hand-typed length, so that
// the rounding vocabulary stays consistent and is tunable from one place
// (ADR-0069). This scanner walks editor/**/*.css and flags any raw numeric
// border-radius value declared outside the token source of truth.

const editorRoot = resolve(process.cwd(), 'editor')
const tokensCss = resolve(editorRoot, 'design-system/tokens.css')

function cssFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...cssFilesUnder(path))
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(path)
    }
  }
  return files
}

// A border-radius value is allowed when it routes through a --radius-* token,
// uses a CSS-wide keyword, or is an explicit zero (no rounding to tokenize).
function isAllowedRadius(value: string): boolean {
  const trimmed = value.trim()
  if (/^var\(\s*--radius-[\w-]+\s*\)$/.test(trimmed)) {
    return true
  }
  if (/^(inherit|initial|unset|revert)$/.test(trimmed)) {
    return true
  }
  return /^0(px|rem)?$/.test(trimmed)
}

interface Violation {
  file: string
  line: number
  value: string
}

function radiusViolationsIn(file: string): Violation[] {
  const violations: Violation[] = []
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const match = line.match(/border-radius:\s*([^;]+);/)
    const value = match?.[1]
    if (value !== undefined && !isAllowedRadius(value)) {
      violations.push({
        file: relative(process.cwd(), file),
        line: index + 1,
        value: value.trim(),
      })
    }
  })
  return violations
}

describe('css literal guard', () => {
  it('declares no raw numeric border-radius outside tokens.css', () => {
    const scanned = cssFilesUnder(editorRoot).filter((file) => file !== tokensCss)
    const violations = scanned.flatMap(radiusViolationsIn)

    const report = violations
      .map(({ file, line, value }) => `${file}:${line}: border-radius: ${value}`)
      .join('\n')

    expect(
      violations,
      `Raw border-radius literals must route through a --radius-* token ` +
        `(add --radius-pill for the 9999px pills). Offending declarations:\n${report}`,
    ).toEqual([])
  })
})
