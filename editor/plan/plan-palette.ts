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
}

// Warm light-theme fallbacks, used when a token reads empty (tests, server render).
// They mirror the `--color-canvas-*` values in tokens.css.
export const DEFAULT_PLAN_PALETTE: PlanPalette = {
  grid: '#e5dcc6',
  wall: '#2f2615',
  roomFill: '#fbf7ef',
  rulerBand: '#f4efe4',
  rulerTick: '#d9cdb4',
  rulerText: '#6e5a3c',
  selection: '#b08646',
}

const CANVAS_TOKENS: Record<keyof PlanPalette, string> = {
  grid: '--color-canvas-grid',
  wall: '--color-canvas-wall',
  roomFill: '--color-canvas-room-fill',
  rulerBand: '--color-canvas-ruler-band',
  rulerTick: '--color-canvas-ruler-tick',
  rulerText: '--color-canvas-ruler-text',
  selection: '--color-canvas-selection',
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
  }
}
