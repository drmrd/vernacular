import { describe, expect, it } from 'vitest'
import { openingAimOutline } from '../index'
import type { OpeningAimOutline, OpeningBand } from '../index'
import { angledOpening, doorAtZ2000, hungWindowAtZ2000 } from './opening-reach-test-support'

describe('openingAimOutline', () => {
  it('traces the whole frame of a door', () => {
    const band: OpeningBand = { bottomMm: 0, topMm: 2032 }

    const outline: OpeningAimOutline = openingAimOutline(doorAtZ2000('door'), band)

    expect(outline).toEqual([
      { x: 550, y: 0, z: -2000 },
      { x: 1450, y: 0, z: -2000 },
      { x: 1450, y: 2032, z: -2000 },
      { x: 550, y: 2032, z: -2000 },
    ])
  })

  it('traces the lower sash of a hung window from the sill to the rail', () => {
    const outline = openingAimOutline(hungWindowAtZ2000('window'), { bottomMm: 0, topMm: 630 })

    expect(outline).toEqual([
      { x: 550, y: 900, z: -2000 },
      { x: 1450, y: 900, z: -2000 },
      { x: 1450, y: 1530, z: -2000 },
      { x: 550, y: 1530, z: -2000 },
    ])
  })

  it('traces the upper sash from the rail to the head', () => {
    const outline = openingAimOutline(hungWindowAtZ2000('window'), { bottomMm: 630, topMm: 1200 })

    expect(outline).toEqual([
      { x: 550, y: 1530, z: -2000 },
      { x: 1450, y: 1530, z: -2000 },
      { x: 1450, y: 2100, z: -2000 },
      { x: 550, y: 2100, z: -2000 },
    ])
  })

  it('follows a wall at an angle', () => {
    const [bottomStart, bottomEnd, topEnd, topStart] = openingAimOutline(angledOpening('angled'), {
      bottomMm: 0,
      topMm: 2000,
    })

    for (const start of [bottomStart, topStart]) {
      expect(start.x).toBeCloseTo(-270)
      expect(start.z).toBeCloseTo(360)
    }
    for (const end of [bottomEnd, topEnd]) {
      expect(end.x).toBeCloseTo(270)
      expect(end.z).toBeCloseTo(-360)
    }
    expect([bottomStart.y, bottomEnd.y, topEnd.y, topStart.y]).toEqual([0, 0, 2000, 2000])
  })
})
