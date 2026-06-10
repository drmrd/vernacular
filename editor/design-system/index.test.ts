import { describe, it, expect } from 'vitest'
import {
  AppFrame,
  PanelSlot,
  useBreakpoint,
  breakpointForWidth,
  clampPaneSize,
  usePaneCollapse,
  usePaneResize,
} from './index'

describe('design-system barrel', () => {
  it('exports the layout primitives and hooks', () => {
    expect(AppFrame).toBeTypeOf('function')
    expect(PanelSlot).toBeTypeOf('function')
    expect(useBreakpoint).toBeTypeOf('function')
    expect(breakpointForWidth).toBeTypeOf('function')
    expect(clampPaneSize).toBeTypeOf('function')
    expect(usePaneCollapse).toBeTypeOf('function')
    expect(usePaneResize).toBeTypeOf('function')
  })
})
