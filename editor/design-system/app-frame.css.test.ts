import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/app-frame.css'), 'utf8')

describe('app-frame.css', () => {
  it('widens the pane resize handle to a 40px pointer hit area without growing the visible bar', () => {
    // The rail/inspector splitter renders a 4px-wide visible bar, far below the
    // WCAG 2.5.8 target-size minimum for a pointer target. Rather than fattening
    // the visible divider (which would dominate the layout), the handle keeps its
    // 4px bar and overlays a transparent, full-height ::before hit area. The base
    // rule must establish a positioning context for that overlay, and the overlay
    // must be an absolutely positioned, full-height strip routed through the
    // shared --size-target-min token (40px, comfortably >= the 24px WCAG floor)
    // rather than a raw pixel value.
    const resize = css.match(/\.ds-app-frame__resize\s*\{[^}]*\}/)?.[0] ?? ''
    expect(resize).not.toBe('')
    expect(resize).toMatch(/position:\s*relative/)

    const overlay = css.match(/\.ds-app-frame__resize::before\s*\{[^}]*\}/)?.[0] ?? ''
    expect(overlay).not.toBe('')
    expect(overlay).toMatch(/position:\s*absolute/)
    expect(overlay).toMatch(/width:\s*var\(--size-target-min\)/)
    expect(overlay).toMatch(/top:\s*0/)
    expect(overlay).toMatch(/bottom:\s*0/)
  })

  it('keeps the status bar inside the frame at medium and narrow by pinning its grid row', () => {
    // The frame is a 100dvh box with overflow: hidden, so the status bar only
    // stays reachable when it places into an explicit `statusbar` grid area. The
    // responsive templates drop that area, so the footer auto-flows into an
    // implicit row past the explicit grid and is clipped. Restoring the
    // `statusbar` area in both templates AND adding an explicit
    // grid-template-rows override (so the row count matches and `main` keeps the
    // single flexible track) pins the status bar inside the frame at every width.
    const medium = css.match(/\.ds-app-frame\[data-breakpoint='medium'\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(medium).not.toBe('')
    expect(medium).toMatch(/grid-template-areas:[^;]*statusbar/)
    expect(medium).toMatch(/grid-template-rows:/)

    const narrow = css.match(/\.ds-app-frame\[data-breakpoint='narrow'\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(narrow).not.toBe('')
    expect(narrow).toMatch(/grid-template-areas:[^;]*statusbar/)
    expect(narrow).toMatch(/grid-template-rows:/)
  })

  it('renders the rail as an overlay when the disclosure is open and gates the toggle by breakpoint', () => {
    // jsdom applies no stylesheets, so the breakpoint-gated visibility of the
    // disclosure is pinned here as a CSS literal guard. The frame must establish
    // a positioning context so the opened rail can float over the canvas: the
    // BASE `.ds-app-frame` rule (not a descendant) carries position: relative.
    const frame = css.match(/\.ds-app-frame\s*\{[^}]*\}/)?.[0] ?? ''
    expect(frame).not.toBe('')
    expect(frame).toMatch(/position:\s*relative/)

    // When opened at medium the hidden rail becomes an absolutely positioned
    // overlay over the main area rather than reclaiming a grid column.
    const overlay =
      css.match(
        /\[data-breakpoint='medium'\]\[data-rail-open='true'\][^{]*\.ds-app-frame__rail\s*\{[^}]*\}/,
      )?.[0] ?? ''
    expect(overlay).not.toBe('')
    expect(overlay).toMatch(/position:\s*absolute/)

    // The toggle is hidden by default so it never shows at wide (where no
    // data-breakpoint override applies and the rail lives in the grid).
    const baseToggle = css.match(/\.ds-app-frame__rail-toggle\s*\{[^}]*\}/)?.[0] ?? ''
    expect(baseToggle).not.toBe('')
    expect(baseToggle).toMatch(/display:\s*none/)

    // The toggle is revealed at BOTH medium and narrow so the rail stays
    // reachable on the narrow notice screen too.
    expect(css).toMatch(/\[data-breakpoint='medium'\][^{]*\.ds-app-frame__rail-toggle/)
    expect(css).toMatch(/\[data-breakpoint='narrow'\][^{]*\.ds-app-frame__rail-toggle/)
  })

  it('shows the unsupported-width notice only at narrow', () => {
    // The narrow unsupported-width notice is always in the DOM but is gated by
    // breakpoint in CSS, which jsdom cannot evaluate, so the visibility contract
    // is pinned here as a literal guard. The base rule hides the notice so it
    // never appears at wide or medium, and a narrow-scoped override reveals it so
    // narrow reads as an explicit defined state rather than breaking silently.
    const base = css.match(/\.ds-app-frame__narrow-notice\s*\{[^}]*\}/)?.[0] ?? ''
    expect(base).not.toBe('')
    expect(base).toMatch(/display:\s*none/)

    const narrowNotice =
      css.match(
        /\[data-breakpoint='narrow'\][^{]*\.ds-app-frame__narrow-notice\s*\{[^}]*\}/,
      )?.[0] ?? ''
    expect(narrowNotice).not.toBe('')
    expect(narrowNotice).toMatch(/display:\s*block/)
  })
})
