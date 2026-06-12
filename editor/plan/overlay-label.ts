import { distance, formatAdaptiveLength, formatArea } from '../../core'
import type { Point, UnitPreferences } from '../../core'
import type { SelectableSceneNode } from './overlay-anchor'

function titleCase(elementType: string): string {
  return elementType
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

/** A trailing clause naming a room's interior voids, empty when it has none. */
function interiorVoidClause(holes: Point[][] | undefined): string {
  const count = holes?.length ?? 0
  if (count === 0) {
    return ''
  }
  return count === 1 ? ', with an interior void' : `, with ${count} interior voids`
}

/** A unit-aware ARIA label, e.g. `Wall, 3000 mm` or `Room Kitchen, 12 m` + superscript-2. */
export function ariaLabel(node: SelectableSceneNode, preferences: UnitPreferences): string {
  switch (node.kind) {
    case 'wall':
      return `Wall, ${formatAdaptiveLength(distance(node.start, node.end), preferences)}`
    case 'room': {
      const voids = interiorVoidClause(node.holes)
      return node.name
        ? `Room ${node.name}, ${formatArea(node.area, preferences)}${voids}`
        : `Room, ${formatArea(node.area, preferences)}${voids}`
    }
    case 'opening':
      return `${titleCase(node.type)}, ${formatAdaptiveLength(node.width, preferences)} wide`
    case 'dimension':
      return `Dimension, ${formatAdaptiveLength(node.length, preferences)}`
  }
}
