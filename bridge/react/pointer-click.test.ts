import { describe, it, expect } from 'vitest'

import { isClick } from './pointer-click'

describe('isClick', () => {
  const tolerance = 6

  it('treats a press and release at the same point as a click', () => {
    expect(isClick({ x: 100, y: 80 }, { x: 100, y: 80 }, tolerance)).toBe(true)
  })

  it('treats a release within the tolerance of the press as a click', () => {
    expect(isClick({ x: 100, y: 80 }, { x: 104, y: 82 }, tolerance)).toBe(true)
  })

  it('treats a release at exactly the tolerance distance as a click', () => {
    // The boundary is inclusive (travel <= tolerance), so a release exactly the tolerance
    // away still counts as a click; this pins the comparison against drifting to a strict <.
    expect(isClick({ x: 100, y: 80 }, { x: 106, y: 80 }, tolerance)).toBe(true)
  })

  it('treats a release dragged beyond the tolerance as not a click', () => {
    // A drag to orbit the camera moves the pointer well past the tolerance; it must not
    // register as a click, so it does not select the entity under the press.
    expect(isClick({ x: 100, y: 80 }, { x: 180, y: 40 }, tolerance)).toBe(false)
  })
})
