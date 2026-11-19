import type { LightingMode } from '../../../core'
import type { SceneSessionState } from '../../../bridge'

/** One view of the reference project whose 3D render time the timing command reports. */
export interface RenderVariant {
  readonly name: string
  readonly scope: SceneSessionState['scope']
  readonly lighting: LightingMode
}

/**
 * The views that get timed, default view first. The scope and the lighting mode are the
 * product's own types, so a rename there breaks the build here. A later lane extends this
 * one list with styles and quality levels.
 */
export const RENDER_VARIANTS: readonly RenderVariant[] = [
  { name: 'floor, schematic', scope: 'floor', lighting: 'schematic' },
  { name: 'floor, realistic', scope: 'floor', lighting: 'realistic' },
  { name: 'building, schematic', scope: 'building', lighting: 'schematic' },
  { name: 'building, realistic', scope: 'building', lighting: 'realistic' },
]
