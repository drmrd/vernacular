import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CommandContext, EditorCommand } from './command'

/** The live command set and the context they run against. */
export interface CommandRegistration {
  commands: EditorCommand[]
  context: CommandContext
}

export interface CommandPaletteValue {
  isOpen: boolean
  open: () => void
  close: () => void
  /**
   * Records the command set the keys are bound to. The keybinding layer publishes
   * on every render, so the palette lists exactly what a keystroke would run.
   */
  publishCommands: (registration: CommandRegistration) => void
  /** The published set, or null where nothing binds keys (a story, an isolated test). */
  readCommands: () => CommandRegistration | null
}

const CommandPaletteContext = createContext<CommandPaletteValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  // The registration is held in a ref, not state: it is refreshed on every render
  // of the keybinding layer, and storing it in state would loop.
  const registration = useRef<CommandRegistration | null>(null)
  const value = useMemo<CommandPaletteValue>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      publishCommands: (next) => {
        registration.current = next
      },
      readCommands: () => registration.current,
    }),
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

/**
 * The palette state when there is one, and null when there is not. The keybinding
 * layer publishes through this, so binding keys outside a palette provider stays
 * legal.
 */
// eslint-disable-next-line react-refresh/only-export-components -- see above; this is the optional read half of the same contract.
export function useOptionalCommandPalette(): CommandPaletteValue | null {
  return useContext(CommandPaletteContext)
}
