import type { ToolId } from '../tools/active-tool-context'

/** The tool an open run belongs to. A run the user left open ends when it changes. */
export interface RunScope {
  tool: ToolId
}
