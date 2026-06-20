import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/status-bar.css'), 'utf8')

describe('status-bar.css', () => {
  it('reserves a steady footprint for the footer coordinate readout', () => {
    // The footer coordinate cell shows live hover coordinates whose width
    // changes as digits and the sign appear/disappear, and collapses to zero
    // when the pointer leaves the canvas. Both shift the snap indicator and the
    // units control to the right. The .status-bar__coords rule must hold a
    // stable box: font-variant-numeric: tabular-nums keeps every digit the same
    // width, and a min-width reservation keeps the cell from growing, shrinking,
    // or collapsing. The exact min-width value is the implementer's call.
    const block = css.match(/\.status-bar__coords\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).not.toBe('')
    expect(block).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(block).toMatch(/min-width:/)
  })
})
