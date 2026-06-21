import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import type { ToolId } from '../tools/active-tool-context'
import { useEscapeToSelect } from './use-escape-to-select'

afterEach(cleanup)

function dispatchWindowKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useEscapeToSelect', () => {
  it('returns a placement tool to select on Escape, and leaves the select tool alone', () => {
    const placementTools: ToolId[] = ['draw-wall', 'place-opening', 'place-furniture']

    for (const tool of placementTools) {
      const setTool = vi.fn()
      const { unmount } = renderHook(() => useEscapeToSelect({ tool, setTool }))

      dispatchWindowKey('Escape')

      expect(setTool).toHaveBeenCalledWith('select')
      unmount()
    }

    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'select', setTool }))

    dispatchWindowKey('Escape')

    expect(setTool).not.toHaveBeenCalled()
  })
})
