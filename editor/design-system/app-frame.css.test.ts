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
})
