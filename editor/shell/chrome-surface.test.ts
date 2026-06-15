import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const shellCss = readFileSync(resolve(process.cwd(), 'editor/shell/editor-shell.css'), 'utf8')
const statusBarCss = readFileSync(resolve(process.cwd(), 'editor/shell/status-bar.css'), 'utf8')

// The body of the rule a selector opens at its first occurrence (no nested braces).
function ruleBody(source: string, selector: string): string {
  const open = source.indexOf('{', source.indexOf(selector))
  return source.slice(open + 1, source.indexOf('}', open))
}

describe('chrome surfaces', () => {
  it('seats the header toolbar on the panel surface so it reads as a chrome band', () => {
    expect(ruleBody(shellCss, '.editor-shell__toolbar {')).toContain('var(--color-surface-panel)')
  })

  it('seats the status bar on the panel surface so it reads as a chrome band', () => {
    expect(ruleBody(statusBarCss, '.status-bar {')).toContain('var(--color-surface-panel)')
  })
})
