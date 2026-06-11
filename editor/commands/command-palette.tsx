import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useEditorSession, useSelection, useActiveFloorId, useSceneGraph } from '../../bridge'
import type { CommandContext, EditorCommand } from './command'
import { createEditorCommands } from './editor-commands'
import { useCommandPalette } from './command-context'

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

export function CommandPaletteDialog({ commands, context, onClose }: CommandPaletteDialogProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = filterCommands(commands, context, query)

  function runCommand(command: EditorCommand): void {
    command.run(context)
    onClose()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    const first = filtered[0]
    if (event.key === 'Enter' && first !== undefined) {
      runCommand(first)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {filtered.map((command) => (
        <button key={command.id} type="button" onClick={() => runCommand(command)}>
          {command.label}
        </button>
      ))}
    </div>
  )
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette()
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  if (!isOpen) {
    return null
  }
  const commands = createEditorCommands()
  const context: CommandContext = {
    session,
    selection,
    graph,
    activeFloorId,
    openPalette: () => {},
  }
  return <CommandPaletteDialog commands={commands} context={context} onClose={close} />
}
