import { describe, expect, it } from 'vitest'
import { AgXToneMapping, NeutralToneMapping, NoToneMapping } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { applyToneMappingOperator } from './tone-mapping'

describe('applyToneMappingOperator', () => {
  it('sets the AgX filmic operator on the renderer', () => {
    const renderer: Pick<WebGPURenderer, 'toneMapping'> = { toneMapping: NoToneMapping }

    applyToneMappingOperator(renderer, 'agx')

    expect(renderer.toneMapping).toBe(AgXToneMapping)
  })

  it('sets the Khronos PBR Neutral operator on the renderer', () => {
    const renderer: Pick<WebGPURenderer, 'toneMapping'> = { toneMapping: NoToneMapping }

    applyToneMappingOperator(renderer, 'neutral')

    expect(renderer.toneMapping).toBe(NeutralToneMapping)
  })
})
