import { describe, it, expect } from 'vitest'
import { clampPaneSize } from './pane-size'

const bounds = { min: 8, max: 24 }

describe('clampPaneSize', () => {
  it('returns an in-range size unchanged', () => {
    expect(clampPaneSize(16, bounds)).toBe(16)
  })

  it('raises a below-min size to the minimum', () => {
    expect(clampPaneSize(2, bounds)).toBe(8)
  })

  it('lowers an above-max size to the maximum', () => {
    expect(clampPaneSize(40, bounds)).toBe(24)
  })

  it('keeps a size that sits exactly on a bound', () => {
    expect(clampPaneSize(8, bounds)).toBe(8)
    expect(clampPaneSize(24, bounds)).toBe(24)
  })
})
