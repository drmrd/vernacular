import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/snap-status.css'), 'utf8')

describe('snap-status.css', () => {
  it('frames the snap indicator as a labeled disclosure control', () => {
    // The footer Snap indicator opens a precision popover, but with a bare
    // border: 0 it reads as muted bold text rather than a button, so users
    // cannot tell it responds to a click. The .snap-status__indicator rule must
    // carry a labeled-button border (1px solid var(--color-border)) instead of
    // border: 0 so it reads as a control; padding and radius are the
    // implementer's call.
    const block = css.match(/\.snap-status__indicator\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).not.toBe('')
    expect(block).toMatch(/border:\s*1px\s+solid/)
    expect(block).not.toMatch(/border:\s*0/)
  })

  it('styles the disclosure caret that signals the snap popover', () => {
    // The indicator renders a caret (.snap-status__caret) after the label to
    // signal that it opens a popover. Without a CSS rule the caret has no
    // styling, so the disclosure cue is invisible. The .snap-status__caret rule
    // must exist with a non-empty declaration block (a muted caret; an .is-open
    // modifier may rotate it).
    const block = css.match(/\.snap-status__caret\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).not.toBe('')
  })

  it('styles the on and off marker states distinctly', () => {
    // The snap marker reflects enabled state via .snap-status__marker--on and
    // .snap-status__marker--off rather than a static decoration. Both state
    // classes must carry their own non-empty rules (active/accent for on, muted
    // for off); without them the state classes are dead selectors.
    const onBlock = css.match(/\.snap-status__marker--on\s*\{[^}]*\}/)?.[0] ?? ''
    const offBlock = css.match(/\.snap-status__marker--off\s*\{[^}]*\}/)?.[0] ?? ''
    expect(onBlock).not.toBe('')
    expect(offBlock).not.toBe('')
  })
})
