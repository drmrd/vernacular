// The colors the 2D plan canvas draws with. A canvas cannot read CSS custom properties
// directly, so the shell resolves these from the design-system tokens once and threads
// them into drawPlan. Keeping them here (rather than hardcoded in the draw routines)
// lets the canvas follow the theme and stay on the warm vellum/umber/brass palette.

export interface PlanPalette {
  grid: string
  wall: string
  roomFill: string
  rulerBand: string
  rulerTick: string
  rulerText: string
  selection: string
  /** The transient hover outline; a lighter brass so it reads as subordinate to selection. */
  hover: string
  /** The in-progress wall-draw guide line and its start marker; a darker brass "ink". */
  preview: string
  /** The fill wash of a selected room, beneath the brass selection outline. */
  selectionFill: string
  /** The translucent fill of the drag-select marquee; its outline uses `selection`. */
  marqueeFill: string
  /** The translucent move-drag ghost overlay; a faint warm brass. */
  ghost: string
  /** Room name/area and dimension length text; a warm umber. */
  label: string
}

// Warm light-theme fallbacks, used when a token reads empty (tests, server render).
// They mirror the `--color-canvas-*` values in tokens.css.
export const DEFAULT_PLAN_PALETTE: PlanPalette = {
  grid: '#dccfb2',
  wall: '#2f2615',
  roomFill: '#fbf7ef',
  rulerBand: '#f4efe4',
  rulerTick: '#d9cdb4',
  rulerText: '#6e5a3c',
  selection: '#b08646',
  hover: '#c8b78f',
  preview: '#8b692a',
  selectionFill: '#e8dac4',
  marqueeFill: 'rgba(176, 134, 70, 0.12)',
  ghost: 'rgba(139, 105, 42, 0.5)',
  label: '#4a3c26',
}

const CANVAS_TOKENS: Record<keyof PlanPalette, string> = {
  grid: '--color-canvas-grid',
  wall: '--color-canvas-wall',
  roomFill: '--color-canvas-room-fill',
  rulerBand: '--color-canvas-ruler-band',
  rulerTick: '--color-canvas-ruler-tick',
  rulerText: '--color-canvas-ruler-text',
  selection: '--color-canvas-selection',
  hover: '--color-canvas-hover',
  preview: '--color-canvas-preview',
  selectionFill: '--color-canvas-selection-fill',
  marqueeFill: '--color-canvas-marquee-fill',
  ghost: '--color-canvas-ghost',
  label: '--color-canvas-label',
}

/**
 * Resolves the plan palette from a variable reader (normally
 * `getComputedStyle(root).getPropertyValue`). Each field falls back to the warm default
 * when its token reads empty, so the canvas never draws with a blank color.
 */
export function resolvePlanPalette(readVar: (name: string) => string): PlanPalette {
  const resolve = (field: keyof PlanPalette): string => {
    const value = readVar(CANVAS_TOKENS[field]).trim()
    return value !== '' ? value : DEFAULT_PLAN_PALETTE[field]
  }
  return {
    grid: resolve('grid'),
    wall: resolve('wall'),
    roomFill: resolve('roomFill'),
    rulerBand: resolve('rulerBand'),
    rulerTick: resolve('rulerTick'),
    rulerText: resolve('rulerText'),
    selection: resolve('selection'),
    hover: resolve('hover'),
    preview: resolve('preview'),
    selectionFill: resolve('selectionFill'),
    marqueeFill: resolve('marqueeFill'),
    ghost: resolve('ghost'),
    label: resolve('label'),
  }
}
