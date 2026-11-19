import type { ToolId } from '../tools/active-tool-context'

/** The tool and the floor an open run belongs to. A run the user left open ends when either changes. */
export interface RunScope {
  tool: ToolId
  activeFloorId: string | null
}
