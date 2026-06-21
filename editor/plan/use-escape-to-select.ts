import { useEffect } from 'react'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'

// The placement tools that the Escape key leaves to return to the select tool.
const PLACEMENT_TOOLS: readonly ToolId[] = ['draw-wall', 'place-opening', 'place-furniture']

const ESCAPE_KEY = 'Escape'

function isPlacementTool(tool: ToolId): boolean {
  return PLACEMENT_TOOLS.includes(tool)
}

export interface EscapeToSelectDeps {
  tool: ToolId
  setTool: (tool: ToolId) => void
}

/**
 * Binds the Escape key on the window to leave any placement tool and return to
 * the select tool. Inert under any non-placement tool, mirroring
 * use-furniture-keyboard.
 */
export function useEscapeToSelect(deps: EscapeToSelectDeps): void {
  const { tool, setTool } = deps
  useEffect(() => {
    if (!isPlacementTool(tool)) {
      return undefined
    }
    const listener = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) {
        return
      }
      if (event.key === ESCAPE_KEY) {
        setTool('select')
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [tool, setTool])
}
