import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button, useFocusTrap } from '../design-system'
import { useEditorSession, useSelection, useActiveFloorId, useSceneGraph } from '../../bridge'
import { useViewMode } from '../viewport/view-mode'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import type { CommandContext, EditorCommand } from './command'
import { createEditorCommands } from './editor-commands'
import { createViewCommands } from './view-commands'
import { createSnapCommands } from './snap-commands'
import { useCommandPalette } from './command-context'
import '../design-system/field.css'
import '../design-system/menu-surface.css'
import './command-palette.css'

interface CommandPaletteDialogProps {
  commands: EditorCommand[]
  context: CommandContext
  onClose: () => void
}

function filterCommands(
  commands: EditorCommand[],
  context: CommandContext,
  query: string,
): EditorCommand[] {
  const needle = query.toLowerCase()
  return commands
    .filter((command) => command.isEnabled(context))
    .filter((command) => command.label.toLowerCase().includes(needle))
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

function CommandList({ commands, onRun }: CommandListProps) {
  return (
    <div className="command-palette__list">
      {commands.map((command) => (
        <Button key={command.id} className="ds-menu-surface__row" onClick={() => onRun(command)}>
          {command.label}
        </Button>
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

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette()
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const view = useViewMode()
  const snapStore = useSnapPreferencesStore()
  const commands = useMemo(
    () => [
      ...createEditorCommands(),
      ...createViewCommands(view),
      ...createSnapCommands(snapStore),
    ],
    [view, snapStore],
  )
  if (!isOpen) {
    return null
  }
  const context: CommandContext = {
    session,
    selection,
    graph,
    activeFloorId,
    openPalette: () => {},
  }
  return <CommandPaletteDialog commands={commands} context={context} onClose={close} />
}
