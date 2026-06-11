import { useEffect, useRef } from 'react'

import { type CommandContext, type EditorCommand, resolveCommandForEvent } from './command'

/** True when the event target is a form field that should swallow keystrokes. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true
  }
  return target instanceof HTMLElement && target.isContentEditable
}

/** True when the running platform looks like macOS. */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /mac/i.test(navigator.platform || navigator.userAgent)
}

/** Run the matching enabled command on keydown, ignoring keystrokes typed into form fields. */
export function useKeybindings(commands: EditorCommand[], context: CommandContext): void {
  const commandsRef = useRef(commands)
  const contextRef = useRef(context)
  commandsRef.current = commands
  contextRef.current = context

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) {
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
