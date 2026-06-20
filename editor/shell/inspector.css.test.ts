import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/inspector.css'), 'utf8')

describe('inspector.css', () => {
  it('fills the period tag with the strong accent so its on-accent text clears WCAG 4.5:1', () => {
    // The period tag pairs --color-on-accent text (vellum-50) over its fill.
    // On --color-accent (brass-500) that pair is only 3.10:1, below the 4.5:1
    // floor for normal text (WCAG 1.4.3). The button system already routes this
    // exact pair through --color-accent-strong (brass-600 = 4.73:1, pinned by
    // palette-contrast.test.ts), so the period tag must use the strong token.
    // The negative assertion is anchored on the ';' terminator because
    // --color-accent-strong contains "--color-accent" as a substring and would
    // otherwise falsely satisfy a bare --color-accent match.
    const tag = css.match(/\.inspector__period-tag\s*\{[^}]*\}/)?.[0] ?? ''
    expect(tag).not.toBe('')
    expect(tag).toMatch(/background:\s*var\(--color-accent-strong\)/)
    expect(tag).not.toMatch(/background:\s*var\(--color-accent\)\s*;/)
  })
})
