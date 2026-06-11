export interface PaneSizeBounds {
  min: number
  max: number
}

export function clampPaneSize(requested: number, bounds: PaneSizeBounds): number {
  return Math.min(Math.max(requested, bounds.min), bounds.max)
}
