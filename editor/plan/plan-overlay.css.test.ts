import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/plan/plan-overlay.css'), 'utf8')

describe('plan-overlay.css', () => {
  it('routes the proxy focus ring through the focus-ring token', () => {
    // The keyboard-and-screen-reader proxies show only their focus ring, and it
    // must clear the 3:1 WCAG UI-contrast floor against the light plan canvas. A
    // hard-coded orange (#f97316) reads at 2.62:1 on the canvas fill and is not
    // theme-aware. Routing the outline through --color-focus-ring (ink-900 on the
    // light canvas = 11.77:1, brass on the dark canvas) clears the floor and tracks
    // the theme instead of restating a fixed orange.
    const ring = css.match(/\.plan-overlay__proxy:focus-visible\s*\{[^}]*\}/)?.[0] ?? ''
    expect(ring).not.toBe('')
    expect(ring).toMatch(/outline:[^;]*var\(--color-focus-ring\)/)
    expect(ring).not.toMatch(/#f97316/i)
  })
})
