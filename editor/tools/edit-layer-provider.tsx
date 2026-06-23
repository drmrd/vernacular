import { useMemo, useState, type ReactNode } from 'react'
import { ActiveEditLayerContext, DEFAULT_EDIT_LAYER, type EditLayer } from './edit-layer-context'

export interface EditLayerProviderProps {
  children: ReactNode
}

/** Provides the active edit layer state to the editor tree. */
export function EditLayerProvider({ children }: EditLayerProviderProps) {
  const [layer, setLayer] = useState<EditLayer>(DEFAULT_EDIT_LAYER)
  const value = useMemo(() => ({ layer, setLayer }), [layer])
  return <ActiveEditLayerContext.Provider value={value}>{children}</ActiveEditLayerContext.Provider>
}
