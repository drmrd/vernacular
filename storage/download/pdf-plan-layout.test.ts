import { describe, expect, it } from 'vitest'
import { placePlanOnPage } from './pdf-plan-layout'

describe('placePlanOnPage', () => {
  it('keeps tall content portrait, fits to height, and centers horizontally', () => {
    expect(placePlanOnPage({ width: 200, height: 400 }, { width: 600, height: 800 }, 50)).toEqual({
      page: { width: 600, height: 800 },
      image: { x: 125, y: 50, width: 350, height: 700 },
    })
  })

  it('swaps wide content to landscape, fits to width, and centers vertically', () => {
    expect(placePlanOnPage({ width: 400, height: 200 }, { width: 600, height: 800 }, 50)).toEqual({
      page: { width: 800, height: 600 },
      image: { x: 50, y: 125, width: 700, height: 350 },
    })
  })
})
