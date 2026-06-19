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

// A font-size value is allowed when it routes through a --font-size-* token or
// uses a CSS keyword (the CSS-wide keywords plus the absolute/relative size
// keywords). Everything else is a raw numeric literal that must reach for a
// --font-size-* token instead. `font-size: inherit` (snap-status.css) is a
// keyword, not a literal, so it stays allowed.
const FONT_SIZE_KEYWORDS =
  /^(inherit|initial|unset|revert|revert-layer|xx-small|x-small|smaller|small|medium|large|larger|x-large|xx-large|xxx-large)$/

function isAllowedFontSize(value: string): boolean {
  const trimmed = value.trim()
  if (/^var\(\s*--font-size-[\w-]+\s*\)$/.test(trimmed)) {
    return true
  }
  return FONT_SIZE_KEYWORDS.test(trimmed)
}

// The `font:` shorthand can smuggle a raw numeric size past the font-size-only
// guard (`font: 11px sans-serif` hides an 11px length). Match the shorthand
// property specifically: `font:` but not `font-size:`/`font-family:`/
// `font-weight:`/`font-style:`/`font-variant:`/`font-feature-settings:`, by
// requiring the character after `font` is not a hyphen. A shorthand size is a
// raw literal when it is a number immediately followed by px/rem/em and is not
// wrapped in a --font-size-* token.
const FONT_SHORTHAND = /\bfont\s*:\s*([^;]+);/
const RAW_LENGTH = /(?<![\w-])\d*\.?\d+(px|rem|em)\b/

function isFontShorthandLine(line: string): boolean {
  return /\bfont\s*:/.test(line) && !/\bfont-[\w]+\s*:/.test(line)
}

function fontShorthandViolation(value: string): boolean {
  const tokenless = value.replace(/var\(\s*--font-size-[\w-]+\s*\)/g, '')
  return RAW_LENGTH.test(tokenless)
}

interface Violation {
  file: string
  line: number
  value: string
}

function violationsIn(
  file: string,
  property: string,
  isAllowed: (value: string) => boolean,
): Violation[] {
  const violations: Violation[] = []
  const declaration = new RegExp(`${property}:\\s*([^;]+);`)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const match = line.match(declaration)
    const value = match?.[1]
    if (value !== undefined && !isAllowed(value)) {
      violations.push({
        file: relative(process.cwd(), file),
        line: index + 1,
        value: value.trim(),
      })
    }
  })
  return violations
}

function fontShorthandViolationsIn(file: string): Violation[] {
  const violations: Violation[] = []
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (!isFontShorthandLine(line)) {
      return
    }
    const value = line.match(FONT_SHORTHAND)?.[1]
    if (value !== undefined && fontShorthandViolation(value)) {
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
  const scannedFiles = (): string[] =>
    cssFilesUnder(editorRoot).filter((file) => file !== tokensCss)

  it('declares no raw numeric border-radius outside tokens.css', () => {
    const violations = scannedFiles().flatMap((file) =>
      violationsIn(file, 'border-radius', isAllowedRadius),
    )

    const report = violations
      .map(({ file, line, value }) => `${file}:${line}: border-radius: ${value}`)
      .join('\n')

    expect(
      violations,
      `Raw border-radius literals must route through a --radius-* token ` +
        `(add --radius-pill for the 9999px pills). Offending declarations:\n${report}`,
    ).toEqual([])
  })

  it('declares no raw numeric font-size outside tokens.css', () => {
    const violations = scannedFiles().flatMap((file) =>
      violationsIn(file, 'font-size', isAllowedFontSize),
    )

    const report = violations
      .map(({ file, line, value }) => `${file}:${line}: font-size: ${value}`)
      .join('\n')

    expect(
      violations,
      `Raw font-size literals must route through a --font-size-* token ` +
        `(snap each value to the nearest token on the xs/sm/md/lg/xl scale). ` +
        `CSS keywords such as 'inherit' stay allowed. Offending declarations:\n${report}`,
    ).toEqual([])
  })

  // Behavior 14c of 14: no editor CSS outside tokens.css declares a raw numeric
  // size inside a `font:` shorthand. The font-size-only guard cannot see the
  // size hidden in `font: 11px sans-serif`, so the shorthand must route its
  // size through a --font-size-* token (or be split into a font-size longhand).
  it('declares no raw numeric size inside a font shorthand outside tokens.css', () => {
    const violations = scannedFiles().flatMap(fontShorthandViolationsIn)

    const report = violations
      .map(({ file, line, value }) => `${file}:${line}: font: ${value}`)
      .join('\n')

    expect(
      violations,
      `Raw sizes inside a 'font:' shorthand must come from a --font-size-* ` +
        `token, or the shorthand must be split into a font-size longhand. ` +
        `Offending declarations:\n${report}`,
    ).toEqual([])
  })
})
