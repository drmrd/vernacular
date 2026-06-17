import { useEffect } from 'react'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'

// The key that rotates the placement ghost while placing furniture.
const ROTATE_KEY = 'r'

export interface FurnitureKeyboardDeps {
  tool: ToolId
  rotateArmed: () => void
}

/**
 * Binds the R key on the window to rotate the placement ghost while the
 * place-furniture tool is active. Inert under any other tool and while a form
 * control is focused, mirroring use-selection-keyboard.
 */
export function useFurnitureKeyboard(deps: FurnitureKeyboardDeps): void {
  const { tool, rotateArmed } = deps
  useEffect(() => {
    if (tool !== 'place-furniture') {
      return undefined
    }
    const listener = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) {
        return
      }
      if (event.metaKey || event.ctrlKey) {
        return
      }
      if (event.key.toLowerCase() === ROTATE_KEY) {
        event.preventDefault()
        rotateArmed()
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [tool, rotateArmed])
}
