import { distance, formatArea, formatLength, lengthFormatOptions } from '../../core'
import type { UnitPreferences } from '../../core'
import type { SelectableSceneNode } from './overlay-anchor'

function titleCase(elementType: string): string {
  return elementType
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

/** A unit-aware ARIA label, e.g. `Wall, 3000 mm` or `Room Kitchen, 12 m` + superscript-2. */
export function ariaLabel(node: SelectableSceneNode, preferences: UnitPreferences): string {
  switch (node.kind) {
    case 'wall':
      return `Wall, ${formatLength(distance(node.start, node.end), lengthFormatOptions(preferences))}`
    case 'room':
      return node.name
        ? `Room ${node.name}, ${formatArea(node.area, preferences)}`
        : `Room, ${formatArea(node.area, preferences)}`
    case 'opening':
      return `${titleCase(node.type)}, ${formatLength(node.width, lengthFormatOptions(preferences))} wide`
    case 'dimension':
      return `Dimension, ${formatLength(node.length, lengthFormatOptions(preferences))}`
  }
}
