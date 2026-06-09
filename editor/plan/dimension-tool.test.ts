import { describe, it, expect } from 'vitest'
import { ADD_DIMENSION } from '../../core'
import { advanceDimensionTool, dimensionPreview, IDLE_DIMENSION_TOOL } from './dimension-tool'

describe('advanceDimensionTool', () => {
  it('records the start on the first click without emitting a command', () => {
    const result = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'floor-1')

    expect(result.state).toEqual({ phase: 'measuring', start: { x: 100, y: 100 } })
    expect(result.command).toBeUndefined()
  })

  it('emits an addDimension command and returns to idle on the second click', () => {
    const measuring = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'floor-1').state
    const result = advanceDimensionTool(measuring, { x: 400, y: 100 }, 'floor-1')

    expect(result.state).toEqual(IDLE_DIMENSION_TOOL)
    expect(result.command?.type).toBe(ADD_DIMENSION)
    expect(result.command?.params.floorId).toBe('floor-1')
    expect(result.command?.params.dimension).toMatchObject({
      start: { x: 100, y: 100 },
      end: { x: 400, y: 100 },
    })
  })

  it('cancels a zero-length measurement back to idle without emitting a command', () => {
    const measuring = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'floor-1').state
    const result = advanceDimensionTool(measuring, { x: 100, y: 100 }, 'floor-1')

    expect(result.state).toEqual(IDLE_DIMENSION_TOOL)
    expect(result.command).toBeUndefined()
  })
})

describe('dimensionPreview', () => {
  it('previews from the recorded start to the cursor while measuring and nothing while idle', () => {
    const measuring = advanceDimensionTool(IDLE_DIMENSION_TOOL, { x: 100, y: 100 }, 'floor-1').state

    expect(dimensionPreview(measuring, { x: 400, y: 100 })).toEqual({
      start: { x: 100, y: 100 },
      end: { x: 400, y: 100 },
    })
    expect(dimensionPreview(IDLE_DIMENSION_TOOL, { x: 400, y: 100 })).toBeUndefined()
  })
})
