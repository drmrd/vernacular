import { AgXToneMapping, NeutralToneMapping } from 'three'
import type { WebGPURenderer } from 'three/webgpu'

import type { ToneMappingOperator } from '../../core'

/**
 * Applies the domain tone-mapping operator to the renderer by translating it to three's
 * numeric constant: `agx` sets AgX (the filmic curve realistic daylight needs) and
 * `neutral` sets Khronos PBR Neutral (hue-preserving, per ADR-0142). The numeric
 * constants are read from `three` at runtime; only the `WebGPURenderer` type is drawn
 * from `three/webgpu`, so the WebGPU build stays out of the import graph, matching
 * create-renderer.ts.
 */
export function applyToneMappingOperator(
  renderer: Pick<WebGPURenderer, 'toneMapping'>,
  operator: ToneMappingOperator,
): void {
  renderer.toneMapping = operator === 'agx' ? AgXToneMapping : NeutralToneMapping
}
