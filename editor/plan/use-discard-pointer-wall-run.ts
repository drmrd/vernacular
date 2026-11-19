import { useEffect } from 'react'
import type { Point } from '../../core'
import type { RunScope } from './run-scope'
import { IDLE_WALL_TOOL, type WallToolState } from './wall-tool'

export interface PointerWallRunResets {
  setToolState: (state: WallToolState) => void
  setPointer: (pointer: Point | null) => void
  clearSnap: () => void
}

/**
 * Ends the pointer wall run when the tool changes, the way Escape does: the run goes
 * idle and the cursor and snap are cleared. The walls it already committed stay. A
 * run that outlived its tool would continue, with a stale rubber band, as soon as
 * the tool is armed again.
 *
 * The effect lists the scope's fields, never the scope object, which is new on every
 * render and would end the run each time.
 */
export function useDiscardPointerWallRun(
  { tool }: RunScope,
  { setToolState, setPointer, clearSnap }: PointerWallRunResets,
): void {
  useEffect(() => {
    setToolState(IDLE_WALL_TOOL)
    setPointer(null)
    clearSnap()
  }, [tool, setToolState, setPointer, clearSnap])
}
