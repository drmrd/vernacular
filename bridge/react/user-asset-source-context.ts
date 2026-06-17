import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react'
import type { UserSource } from '../../storage'

// Null until app boot provides the real user library source. The import action
// no-ops while it is absent, so a bare render (a story or isolated test) does
// not throw.
const UserAssetSourceContext = createContext<UserSource | null>(null)

export interface UserAssetSourceProviderProps {
  source: UserSource
  children: ReactNode
}

export function UserAssetSourceProvider({
  source,
  children,
}: UserAssetSourceProviderProps): ReactElement {
  return createElement(UserAssetSourceContext.Provider, { value: source }, children)
}

export function useUserAssetSource(): UserSource | null {
  return useContext(UserAssetSourceContext)
}
