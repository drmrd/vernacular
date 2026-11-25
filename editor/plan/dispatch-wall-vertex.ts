import { drawnWallNote, type Point } from '../../core'
import type { EditorSession } from '../../bridge'
import { advanceWallTool, type WallToolResult, type WallToolState } from './wall-tool'

export function dispatchWallVertex(
  { session, toolState }: { session: EditorSession; toolState: WallToolState },
  point: Point,
  floorId: string,
): WallToolResult & { note: string | undefined } {
  const result = advanceWallTool(toolState, point, floorId)
  let note: string | undefined
  for (const command of result.commands ?? []) {
    const floor = session.getProject().floors.find((floor) => floor.id === floorId)
    // The new wall would count as overlap if we read the floor after dispatch.
    note = drawnWallNote(floor?.walls ?? [], command.params.wall)
    session.dispatch(command)
  }
  return { ...result, note }
}
