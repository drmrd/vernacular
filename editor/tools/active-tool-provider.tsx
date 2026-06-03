import { useMemo, useState, type ReactNode } from 'react'
import { ActiveToolContext, DEFAULT_TOOL, type ToolId } from './active-tool-context'

export interface ActiveToolProviderProps {
  children: ReactNode
}

export function ActiveToolProvider({ children }: ActiveToolProviderProps) {
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL)
  const value = useMemo(() => ({ tool, setTool }), [tool])
  return <ActiveToolContext.Provider value={value}>{children}</ActiveToolContext.Provider>
}
