import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface CommandPaletteValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

const CommandPaletteContext = createContext<CommandPaletteValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const value = useMemo<CommandPaletteValue>(
    () => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen],
  )
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook is the read half of this provider's public contract and ships beside it; this slice's test imports useCommandPalette from ./command-context.
export function useCommandPalette(): CommandPaletteValue {
  const value = useContext(CommandPaletteContext)
  if (value === null) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider')
  }
  return value
}
