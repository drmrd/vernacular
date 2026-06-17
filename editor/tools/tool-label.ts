import type { ToolId } from './active-tool-context'

/** A short human-readable label for the active editor tool, shown in the status bar. */
export function toolLabel(tool: ToolId): string {
  switch (tool) {
    case 'select':
      return 'Select'
    case 'pan':
      return 'Pan'
    case 'draw-wall':
      return 'Wall'
    case 'place-opening':
      return 'Opening'
    case 'dimension':
      return 'Dimension'
    case 'calibrate':
      return 'Calibrate'
    case 'place-furniture':
      return 'Furniture'
  }
}
