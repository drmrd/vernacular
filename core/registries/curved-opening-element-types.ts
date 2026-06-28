import type { ElementType } from './element-types'

/**
 * Curved-head window types for historic and period-vernacular architecture (the
 * old-house vocabulary track, ADR-0044). Each carries its head shape in
 * `scene3D.voidContour`, the registry shape parameter that drives both the 2D
 * plan symbol and the 3D wall-cut void, so the head shape resolves the same way a
 * rectangular opening's does.
 */
export const curvedOpeningElementTypes: ElementType[] = [
  {
    // A segmental-arch window: a fixed sash under a shallow round-topped head, a
    // staple of Victorian and Italianate facades.
    id: 'arched-window',
    category: 'opening',
    plan2D: { symbol: 'window-fixed' },
    scene3D: { builder: 'window-frame', voidContour: 'arched', fill: 'window-sash' },
    opening: {
      family: 'window-fixed',
      defaultWidth: 700,
      defaultHeight: 1500,
      defaultSillHeight: 800,
    },
  },
  {
    // A round-top (semicircular-headed) window, common over entries and on
    // Romanesque and Colonial Revival elevations.
    id: 'round-top-window',
    category: 'opening',
    plan2D: { symbol: 'window-fixed' },
    scene3D: { builder: 'window-frame', voidContour: 'round', fill: 'window-sash' },
    opening: {
      family: 'window-fixed',
      defaultWidth: 700,
      defaultHeight: 1400,
      defaultSillHeight: 800,
    },
  },
  {
    // A lancet window: the tall, narrow pointed-arch window of Gothic Revival and
    // Carpenter Gothic houses.
    id: 'lancet-window',
    category: 'opening',
    plan2D: { symbol: 'window-fixed' },
    scene3D: { builder: 'window-frame', voidContour: 'lancet', fill: 'window-sash' },
    opening: {
      family: 'window-fixed',
      defaultWidth: 450,
      defaultHeight: 1800,
      defaultSillHeight: 700,
    },
  },
]
