import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button, useFocusTrap } from '../design-system'
import { useEditorSession, useSelection, useActiveFloorId, useSceneGraph } from '../../bridge'
import { useViewMode } from '../viewport/view-mode'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import type { CommandContext, EditorCommand } from './command'
import { createCommandSet } from './command-set'
import { OPEN_PALETTE_COMMAND_ID } from './editor-commands'
import { formatKeybinding, isMacPlatform } from './keybinding'
import { useCommandPalette, type CommandRegistration } from './command-context'
import '../design-system/field.css'
import '../design-system/menu-surface.css'
import './command-palette.css'

interface CommandPaletteDialogProps {
  commands: EditorCommand[]
  context: CommandContext
  onClose: () => void
}

/** The shortcut printed on a command's row: its first binding, or none. */
function primaryBinding(command: EditorCommand): string | undefined {
  const binding = command.keybindings[0]
  return binding === undefined ? undefined : formatKeybinding(binding, isMacPlatform())
}

// A command is found by what the reader can see on its row: its name and the
// shortcut printed beside it, so searching for the chord finds the command.
function searchText(command: EditorCommand): string {
  return `${command.label} ${primaryBinding(command) ?? ''}`.toLowerCase()
}

function filterCommands(
  commands: EditorCommand[],
  context: CommandContext,
  query: string,
): EditorCommand[] {
  const needle = query.toLowerCase()
  return commands
    .filter((command) => command.id !== OPEN_PALETTE_COMMAND_ID)
    .filter((command) => command.isEnabled(context))
    .filter((command) => searchText(command).includes(needle))
}

function useFocusRestoringClose(onClose: () => void): () => void {
  const openerRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
  }, [])
  return () => {
    onClose()
    openerRef.current?.focus()
  }
}

interface SearchInputProps {
  query: string
  onQueryChange: (query: string) => void
}

function SearchInput({ query, onQueryChange }: SearchInputProps) {
  return (
    <input
      type="text"
      aria-label="Search commands"
      className="ds-field__control command-palette__search"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
    />
  )
}

interface CommandListProps {
  commands: EditorCommand[]
  onRun: (command: EditorCommand) => void
}

function CommandRow({ command, onRun }: { command: EditorCommand; onRun: () => void }) {
  const binding = primaryBinding(command)
  return (
    <Button className="ds-menu-surface__row" onClick={onRun} aria-keyshortcuts={binding}>
      {command.label}
      {/* The chord is already on the button as aria-keyshortcuts, so the printed
          copy is decorative and stays out of the row's accessible name. */}
      {binding ? (
        <span className="command-palette__binding" aria-hidden="true">
          {binding}
        </span>
      ) : null}
    </Button>
  )
}

function CommandList({ commands, onRun }: CommandListProps) {
  return (
    <div className="command-palette__list">
      {commands.map((command) => (
        <CommandRow key={command.id} command={command} onRun={() => onRun(command)} />
      ))}
    </div>
  )
}

export function CommandPaletteDialog({ commands, context, onClose }: CommandPaletteDialogProps) {
  const [query, setQuery] = useState('')
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const close = useFocusRestoringClose(onClose)

  const filtered = filterCommands(commands, context, query)

  function runCommand(command: EditorCommand): void {
    command.run(context)
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    const first = filtered[0]
    if (event.key === 'Enter' && first !== undefined) {
      event.stopPropagation()
      runCommand(first)
    }
  }

  return (
    <div className="command-palette__backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="ds-menu-surface command-palette__panel"
        onKeyDown={handleKeyDown}
      >
        <SearchInput query={query} onQueryChange={setQuery} />
        <CommandList commands={filtered} onRun={runCommand} />
      </div>
    </div>
  )
}

/**
 * The command set to show where nothing binds keys, such as a story or an isolated
 * mount. It comes from the same factory the keybinding layer uses, so the two can
 * never list different commands; only Save is missing, because saving belongs to
 * the editor that owns the project.
 */
function useUnboundCommandSet(): CommandRegistration {
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const view = useViewMode()
  const snapStore = useSnapPreferencesStore()
  const commands = useMemo(() => createCommandSet({ view, snapStore }), [view, snapStore])
  return {
    commands,
    context: { session, selection, graph, activeFloorId, openPalette: () => {} },
  }
}

export function CommandPalette() {
  const { isOpen, close, readCommands } = useCommandPalette()
  const unbound = useUnboundCommandSet()
  if (!isOpen) {
    return null
  }
  const { commands, context } = readCommands() ?? unbound
  return <CommandPaletteDialog commands={commands} context={context} onClose={close} />
}
