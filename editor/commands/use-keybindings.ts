import { useEffect, useRef } from 'react'

import { ownsKeystroke } from '../plan/keyboard-guard'
import { type CommandContext, type EditorCommand, resolveCommandForEvent } from './command'
import { useOptionalCommandPalette } from './command-context'
import { isMacPlatform } from './keybinding'

/**
 * Run the matching enabled command on keydown, ignoring keystrokes a focused
 * control owns. The set is also published to the palette, so the palette lists the
 * same commands the keys run rather than assembling a second list of its own.
 */
export function useKeybindings(commands: EditorCommand[], context: CommandContext): void {
  const commandsRef = useRef(commands)
  const contextRef = useRef(context)
  commandsRef.current = commands
  contextRef.current = context
  // Published during render, so a palette rendered after this layer in the same
  // pass reads the current set rather than the previous one.
  useOptionalCommandPalette()?.publishCommands({ commands, context })

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if (ownsKeystroke(event.target, event.key)) {
        return
      }
      const command = resolveCommandForEvent(
        commandsRef.current,
        event,
        isMacPlatform(),
        contextRef.current,
      )
      if (command !== null) {
        event.preventDefault()
        command.run(contextRef.current)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])
}
