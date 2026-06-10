import { useCallback, useState } from 'react'
import { clampPaneSize, type PaneSizeBounds } from './pane-size'

export interface PaneResizeOptions extends PaneSizeBounds {
  initial: number
}

export interface PaneResize {
  size: number
  onResizeStep: (delta: number) => void
  onResizeTo: (value: number) => void
}

export function usePaneResize(options: PaneResizeOptions): PaneResize {
  const { initial, min, max } = options
  const [size, setSize] = useState(() => clampPaneSize(initial, { min, max }))
  const onResizeStep = useCallback(
    (delta: number) => setSize((current) => clampPaneSize(current + delta, { min, max })),
    [min, max],
  )
  const onResizeTo = useCallback(
    (value: number) => setSize(clampPaneSize(value, { min, max })),
    [min, max],
  )
  return { size, onResizeStep, onResizeTo }
}
