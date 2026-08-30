import { useEffect } from 'react'
import type { ToolId } from '../tools/active-tool-context'
import { ownsKeystroke, wasKeystrokeClaimed } from './keyboard-guard'

// The placement tools that the Escape key leaves to return to the select tool.
// Every tool that arms the canvas for a drop or a measurement belongs here, so one
// key gets the user back to select from wherever they are.
const PLACEMENT_TOOLS: readonly ToolId[] = [
  'draw-wall',
  'place-opening',
  'place-furniture',
  'place-stair',
  'dimension',
  'calibrate',
]

const ESCAPE_KEY = 'Escape'

function isPlacementTool(tool: ToolId): boolean {
  return PLACEMENT_TOOLS.includes(tool)
}

export interface EscapeToSelectDeps {
  tool: ToolId
  setTool: (tool: ToolId) => void
}

/**
 * The second rung of the Escape ladder: leave a placement tool and return to select.
 *
 * The first rung belongs to the tools themselves, which cancel a run in progress
 * and claim the keystroke, so one Escape abandons the run and keeps the tool armed
 * and the next one comes back here. The decision waits until the keystroke has
 * finished reaching every listener, because the tools that cancel are spread across
 * sibling hooks and some of them subscribe after this one; deciding inside the
 * listener would make the ladder depend on the order those hooks happen to mount.
 *
 * Inert under any non-placement tool, mirroring use-furniture-keyboard. A tool chip
 * left holding focus by the click that armed the tool does not swallow the key,
 * since a button never owns Escape.
 */
export function useEscapeToSelect(deps: EscapeToSelectDeps): void {
  const { tool, setTool } = deps
  useEffect(() => {
    if (!isPlacementTool(tool)) {
      return undefined
    }
    const listener = (event: KeyboardEvent): void => {
      if (ownsKeystroke(event.target, event.key) || event.key !== ESCAPE_KEY) {
        return
      }
      queueMicrotask(() => {
        if (!wasKeystrokeClaimed(event)) {
          setTool('select')
        }
      })
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [tool, setTool])
}
