import { describe, expect, it } from 'vitest'
import { rasterTargetSize } from './raster-target-size'

const MAX_EDGE = 2000

describe('rasterTargetSize', () => {
  it('scales the longest edge down to the max when width is longest', () => {
    expect(rasterTargetSize(4000, 2000, MAX_EDGE)).toEqual({
      width: 2000,
      height: 1000,
    })
  })

  it('scales the longest edge down to the max when height is longest', () => {
    expect(rasterTargetSize(2000, 4000, MAX_EDGE)).toEqual({
      width: 1000,
      height: 2000,
    })
  })

  it('never upscales a plan that already fits under the max edge', () => {
    expect(rasterTargetSize(1000, 500, MAX_EDGE)).toEqual({
      width: 1000,
      height: 500,
    })
  })

  it('leaves a plan unchanged when its longest edge is exactly the max', () => {
    const exactEdge = 1000
    expect(rasterTargetSize(1000, 1000, exactEdge)).toEqual({
      width: 1000,
      height: 1000,
    })
  })

  it('rounds each dimension to a whole number of pixels', () => {
    const oneThousand = 1000
    expect(rasterTargetSize(3000, 1000, oneThousand)).toEqual({
      width: 1000,
      height: 333,
    })
  })
})
