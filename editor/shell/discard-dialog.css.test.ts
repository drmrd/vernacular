import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/discard-dialog.css'), 'utf8')

describe('discard-dialog.css', () => {
  it('pins the backdrop to the viewport so the prompt never lands below the fold', () => {
    // The prompt is a sibling of the AppFrame, and the frame's root is a
    // full-viewport grid with overflow hidden. An in-flow prompt therefore lays
    // out one whole viewport below the fold: the click that opened it looks like
    // it did nothing at all. Taking the backdrop out of flow and covering the
    // viewport with it is what puts the prompt in front of the user.
    const backdrop = css.match(/\.discard-dialog__backdrop\s*\{[^}]*\}/)?.[0] ?? ''
    expect(backdrop).not.toBe('')
    expect(backdrop).toMatch(/position:\s*fixed/)
    expect(backdrop).toMatch(/inset:\s*0/)
    expect(backdrop).toMatch(/z-index:/)
    expect(backdrop).toMatch(/align-items:\s*center/)
    expect(backdrop).toMatch(/justify-content:\s*center/)
  })

  it('bounds the prompt panel so it stays inside a narrow viewport', () => {
    const panel = css.match(/\.discard-dialog\s*\{[^}]*\}/)?.[0] ?? ''
    expect(panel).not.toBe('')
    expect(panel).toMatch(/max-width:/)
  })
})
