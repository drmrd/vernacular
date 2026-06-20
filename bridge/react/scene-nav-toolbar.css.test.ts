import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'bridge/react/scene-nav-toolbar.css'), 'utf8')

describe('scene-nav-toolbar.css', () => {
  it('contains no raw hex color values, only semantic tokens', () => {
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hex).toEqual([])
  })

  it('seats the toolbar on the panel surface like the 2D shell chrome', () => {
    expect(css).toMatch(/\.scene-nav-toolbar\b/)
    expect(css).toContain('var(--color-surface-panel)')
    expect(css).toContain('var(--color-border)')
    expect(css).toContain('var(--radius-md)')
  })

  it('marks the active camera mode with the brass indicator token', () => {
    expect(css).toContain('.scene-nav-toolbar__mode')
    expect(css).toContain('var(--color-indicator)')
  })

  it('styles the reset and preset buttons as muted toolbar buttons', () => {
    expect(css).toContain('.scene-nav-toolbar__btn')
    expect(css).toContain('var(--color-text-muted)')
    expect(css).toContain('var(--color-surface-active)')
  })

  it('expresses the grouped tier hierarchy via cluster classes spaced with space tokens', () => {
    expect(css).toContain('.scene-nav-toolbar__primary')
    expect(css).toContain('.scene-nav-toolbar__secondary')
    expect(css).toContain('.scene-nav-toolbar__environment')

    const clusterRules = css.match(
      /\.scene-nav-toolbar__(?:primary|secondary|environment)\b[^{]*\{[^}]*\}/g,
    )
    expect(clusterRules).not.toBeNull()
    const clusterCss = (clusterRules ?? []).join('\n')
    expect(clusterCss).toMatch(/var\(--space-/)
    expect(clusterCss).not.toMatch(/gap:\s*\d/)
  })

  it('gives the 3D nav buttons and mode pills a 40px minimum target height', () => {
    const btn = css.match(/\.scene-nav-toolbar__btn\s*\{[^}]*\}/)?.[0] ?? ''
    const mode = css.match(/\.scene-nav-toolbar__mode\s*\{[^}]*\}/)?.[0] ?? ''

    expect(btn).not.toBe('')
    expect(mode).not.toBe('')

    expect(btn).toMatch(/min-height:\s*var\(--size-target-min\)/)
    expect(btn).not.toMatch(/height:\s*28px/)

    expect(mode).toMatch(/min-height:\s*var\(--size-target-min\)/)
  })
})
