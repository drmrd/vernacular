// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { srgbToLinear } from '../../../core/color/oklab.ts'
import { GROUND_SURFACE_HEX } from '../../../core/environment/ground-surface.ts'
import { LINEAR_SCALE, LINEAR_TABLE, TARGET_HEX } from './srgb-table.mjs'

const CODE_COUNT = 256
const MAX_CODE = 255
const ONE_TABLE_UNIT = 1 / LINEAR_SCALE

describe('the generator sRGB table', () => {
  it('has 256 integer entries', () => {
    expect(LINEAR_TABLE).toHaveLength(CODE_COUNT)
    expect(LINEAR_TABLE.every(Number.isInteger)).toBe(true)
  })

  it('agrees with srgbToLinear within one table unit for every code', () => {
    for (let code = 0; code < CODE_COUNT; code += 1) {
      const fromTable = LINEAR_TABLE[code] / LINEAR_SCALE
      const fromModule = srgbToLinear(code / MAX_CODE)
      expect(Math.abs(fromTable - fromModule), `code ${code}`).toBeLessThanOrEqual(ONE_TABLE_UNIT)
    }
  })

  it('targets the lawn hex', () => {
    expect(TARGET_HEX).toBe(GROUND_SURFACE_HEX)
  })
})
