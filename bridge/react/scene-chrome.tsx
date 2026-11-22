import { useState, type ReactElement, type ReactNode } from 'react'
import { SceneChromeContext, useSceneChromeHidden } from './scene-chrome-context'

export function SceneChromeProvider({ children }: { children: ReactNode }): ReactElement {
  const [hidden, setHidden] = useState(false)
  return (
    <SceneChromeContext.Provider value={{ hidden, setHidden }}>
      {children}
    </SceneChromeContext.Provider>
  )
}

/** The controls around the scene that mean nothing while a failure view stands in for it. */
export function SceneChrome({ children }: { children: ReactNode }): ReactNode {
  return useSceneChromeHidden() ? null : children
}
