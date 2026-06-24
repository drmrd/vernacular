import { createContext, useContext } from 'react'

import type { ToolId } from './tool-types'

export { DEFAULT_TOOL, type ToolId } from './tool-types'

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
