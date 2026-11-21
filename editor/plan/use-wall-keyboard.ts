import { useEffect, useRef } from 'react'
import type { ToolId } from '../tools/active-tool-context'
import { isActivationPressAlreadyHandled } from './activation-keys'
import { buttonOwnsEnter, claimKeystroke, ownsKeystroke } from './keyboard-guard'

interface WallKeyboardDeps {
  tool: ToolId
  finish: () => void
  backspace: () => void
  // Abandons a run in progress; reports whether there was one to abandon.
  cancel: () => boolean
}

/**
 * Escape abandons the run, Enter ends it, and Backspace undoes the last segment.
 * An Enter or Space an entity proxy already handled, or an Enter a focused button
 * owns, is not a run key, so it must not finish the run.
 *
 * The handlers are read through a ref refreshed every render, so the window listener
 * subscribes once per tool change. A render-scoped subscription would re-add the
 * listener mid-keystroke when a sibling hook updates state inside the same keydown,
 * and the DOM drops a listener re-added during dispatch, silently swallowing this
 * run-control key.
 */
export function useWallKeyboard({ tool, finish, backspace, cancel }: WallKeyboardDeps): void {
  const handlersRef = useRef({ finish, backspace, cancel })
  handlersRef.current = { finish, backspace, cancel }
  useEffect(() => {
    if (tool !== 'draw-wall') {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        ownsKeystroke(event.target, event.key) ||
        buttonOwnsEnter(event.target, event.key) ||
        isActivationPressAlreadyHandled(event)
      ) {
        return
      }
      const handlers = handlersRef.current
      if (event.key === 'Escape') {
        // Claim the key only when there was a run to abandon; at rest the ladder
        // moves on and Escape returns to the select tool.
        if (handlers.cancel()) {
          claimKeystroke(event)
        }
      } else if (event.key === 'Enter') {
        handlers.finish()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        handlers.backspace()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool])
}
