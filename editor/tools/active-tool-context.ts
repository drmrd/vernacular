import { createContext, useContext } from 'react'

export type ToolId = 'draw-wall' | 'select' | 'calibrate' | 'place-opening'

export const DEFAULT_TOOL: ToolId = 'draw-wall'

export interface ActiveToolValue {
  tool: ToolId
  setTool: (tool: ToolId) => void
}

export const ActiveToolContext = createContext<ActiveToolValue | null>(null)

export function useActiveTool(): ActiveToolValue {
  const value = useContext(ActiveToolContext)
  if (value === null) {
    throw new Error('useActiveTool must be used within an ActiveToolProvider')
  }
  return value
}
