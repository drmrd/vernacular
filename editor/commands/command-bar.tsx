import { useMemo } from 'react'
import { useEditorSession, useSelection, useActiveFloorId, useSceneGraph } from '../../bridge'
import { Button } from '../design-system'
import type { CommandContext, EditorCommand } from './command'
import { createEditorCommands } from './editor-commands'
import { useCommandPalette } from './command-context'

function CommandButton({ command, context }: { command: EditorCommand; context: CommandContext }) {
  return (
    <Button disabled={!command.isEnabled(context)} onClick={() => command.run(context)}>
      {command.label}
    </Button>
  )
}

export function CommandBar() {
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const palette = useCommandPalette()
  const commands = useMemo(() => createEditorCommands(), [])
  const context: CommandContext = {
    session,
    selection,
    graph,
    activeFloorId,
    openPalette: palette.open,
  }
  const undo = commands.find((command) => command.id === 'undo')
  const redo = commands.find((command) => command.id === 'redo')
  const openPalette = commands.find((command) => command.id === 'open-command-palette')
  return (
    <div>
      {undo && <CommandButton command={undo} context={context} />}
      {redo && <CommandButton command={redo} context={context} />}
      {openPalette && <CommandButton command={openPalette} context={context} />}
    </div>
  )
}
