import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/tools/tools-panel.css'), 'utf8')

describe('tools-panel.css', () => {
  it('lays the tool-chip grid out as a single column at the default rail width', () => {
    // The ~11rem default tool rail cannot fit two columns of full-width,
    // left-aligned chips, so long labels (e.g. "Chimney") clip. The default
    // .tools-panel__grid declaration must be a single 1fr column. A wider rail
    // may opt back into two columns inside a min-width media/container query,
    // but the base rule stays single-column.
    const grid = css.match(/\.tools-panel__grid\s*\{[^}]*\}/)?.[0] ?? ''
    expect(grid).not.toBe('')
    expect(grid).toMatch(/grid-template-columns:\s*1fr\s*;/)
    expect(grid).not.toMatch(/grid-template-columns:\s*1fr\s+1fr/)
  })
})
