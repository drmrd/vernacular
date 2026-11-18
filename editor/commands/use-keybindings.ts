import { useEffect, useRef } from 'react'

import { ownsKeystroke } from '../plan/keyboard-guard'
import { type CommandContext, type EditorCommand, resolveCommandForEvent } from './command'
import { useOptionalCommandPalette } from './command-context'
import { isMacPlatform } from './keybinding'

/**
 * Run the matching enabled command on keydown, ignoring keystrokes a focused
 * control owns. The browser default of a matched keystroke is prevented in the
 * capture phase on the window, so a chord the editor binds never reaches the
 * browser even when an open dialog holds the keystroke back; the command itself
 * runs in the bubble phase, where such a dialog can stop it. A keystroke the
 * focused control owns, or one that no enabled command binds, keeps its default.
 * The set is also published to the palette, so the palette lists the same
 * commands the keys run rather than assembling a second list of its own.
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
    function findCommand(event: KeyboardEvent): EditorCommand | null {
      if (ownsKeystroke(event.target, event.key)) {
        return null
      }
      return resolveCommandForEvent(commandsRef.current, event, isMacPlatform(), contextRef.current)
    }
    function preventBoundDefault(event: KeyboardEvent): void {
      if (findCommand(event) !== null) {
        event.preventDefault()
      }
    }
    function runBoundCommand(event: KeyboardEvent): void {
      findCommand(event)?.run(contextRef.current)
    }
    window.addEventListener('keydown', preventBoundDefault, true)
    window.addEventListener('keydown', runBoundCommand)
    return () => {
      window.removeEventListener('keydown', preventBoundDefault, true)
      window.removeEventListener('keydown', runBoundCommand)
    }
  }, [])
}
