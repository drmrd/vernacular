import { createContext, useContext, useLayoutEffect } from 'react'

interface SceneChromeState {
  hidden: boolean
  setHidden: (hidden: boolean) => void
}

export const SceneChromeContext = createContext<SceneChromeState>({
  hidden: false,
  setHidden: () => undefined,
})

export function useSceneChromeHidden(): boolean {
  return useContext(SceneChromeContext).hidden
}

/** Hides the scene chrome of the nearest provider for as long as the caller is mounted; one failure host per provider is assumed. */
export function useHideSceneChrome(): void {
  const { setHidden } = useContext(SceneChromeContext)
  useLayoutEffect(() => {
    setHidden(true)
    return () => setHidden(false)
  }, [setHidden])
}
