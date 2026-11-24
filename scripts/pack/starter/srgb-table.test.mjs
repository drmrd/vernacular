// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { srgbToLinear } from '../../../core/color/oklab.ts'
import { GROUND_SURFACE_HEX } from '../../../core/environment/ground-surface.ts'
import { LINEAR_SCALE, LINEAR_TABLE, TARGET_HEX } from './srgb-table.mjs'

const CODE_COUNT = 256
const MAX_CODE = 255
const LINEAR_TOLERANCE = 1 / 65535

describe('the generator sRGB table', () => {
  it("the generator's table of linear values agrees with the color module, and its target is the lawn hex", () => {
    expect(LINEAR_TABLE).toHaveLength(CODE_COUNT)
    expect(LINEAR_TABLE.every(Number.isInteger)).toBe(true)

    for (let code = 0; code < CODE_COUNT; code += 1) {
      const fromTable = LINEAR_TABLE[code] / LINEAR_SCALE
      const fromModule = srgbToLinear(code / MAX_CODE)
      expect(Math.abs(fromTable - fromModule)).toBeLessThanOrEqual(LINEAR_TOLERANCE)
    }

    expect(TARGET_HEX).toBe(GROUND_SURFACE_HEX)
  })
})
