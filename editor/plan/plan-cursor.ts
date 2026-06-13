import type { ToolId } from '../tools/active-tool-context'

const CROSSHAIR_TOOLS: ReadonlySet<ToolId> = new Set([
  'draw-wall',
  'calibrate',
  'place-opening',
  'dimension',
])

export function planCursor(tool: ToolId, panning: boolean): string {
  if (panning) {
    return 'grabbing'
  }
  if (tool === 'select') {
    return 'grab'
  }
  return CROSSHAIR_TOOLS.has(tool) ? 'crosshair' : 'default'
}
