import { useCallback, useState } from 'react'

export interface PaneCollapse {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

export function usePaneCollapse(initial: boolean): PaneCollapse {
  const [collapsed, setCollapsed] = useState(initial)
  const toggle = useCallback(() => setCollapsed((value) => !value), [])
  return { collapsed, toggle, setCollapsed }
}
