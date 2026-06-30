import type { ElementType } from './element-types'

/**
 * Crank window types: casement, awning, and hopper. Each carries the hinge edge
 * it cranks on (`opening.hingeEdge`), the registry parameter that drives its
 * walk-mode motion (jamb for a casement, head for an awning, sill for a hopper).
 * Held alongside the curved-head windows in their own table to keep the main
 * element-type registry within its line budget.
 */
export const crankWindowElementTypes: ElementType[] = [
  {
    id: 'casement-window',
    category: 'opening',
    plan2D: { symbol: 'window-crank' },
    scene3D: { builder: 'window-frame', voidContour: 'rectangular', fill: 'window-sash' },
    opening: {
      family: 'window-crank',
      hingeEdge: 'jamb',
      defaultWidth: 600,
      defaultHeight: 1200,
      defaultSillHeight: 900,
    },
  },
  {
    id: 'awning-window',
    category: 'opening',
    plan2D: { symbol: 'window-crank' },
    scene3D: { builder: 'window-frame', voidContour: 'rectangular', fill: 'window-sash' },
    opening: {
      family: 'window-crank',
      hingeEdge: 'head',
      defaultWidth: 900,
      defaultHeight: 600,
      defaultSillHeight: 1500,
    },
  },
  {
    id: 'hopper-window',
    category: 'opening',
    plan2D: { symbol: 'window-crank' },
    scene3D: { builder: 'window-frame', voidContour: 'rectangular', fill: 'window-sash' },
    opening: {
      family: 'window-crank',
      hingeEdge: 'sill',
      defaultWidth: 900,
      defaultHeight: 600,
      defaultSillHeight: 300,
    },
  },
]
