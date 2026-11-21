import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/viewport/view-mode-viewport.css'), 'utf8')

describe('view-mode-viewport.css', () => {
  it('keeps the split panes from scrolling so the plan stage fits its pane', () => {
    // The plan stage takes the size of its pane. A pane that scrolls (overflow: auto
    // or scroll) would let content overflow the pane instead of fitting it, push the
    // mode toolbar out of view, and hide the stage-size feedback loop. The panes
    // stay non-scrolling; the plan area and stage clip their own overflow.
    const pane = css.match(/\.view-mode-viewport__pane\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(pane).not.toBe('')
    expect(pane).not.toMatch(/overflow(?:-[xy])?:\s*(?:auto|scroll)\b/)
  })
})
