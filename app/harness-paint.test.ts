import { describe, it, expect } from 'vitest'
import {
  colorFromHex,
  solidTreatment,
  surfaceKey,
  type Point,
  type SurfaceTreatment,
} from '../core'
import { HARNESS_FIXTURES } from '../bridge/react/harness-fixtures'
import { resolveHarnessPaint } from './harness-paint'

const floorKey = surfaceKey({ kind: 'floor', floorId: 'demo' })

const WALL_ID_PREFIX = 'wall:'

const centroid = (ring: readonly Point[]): Point => ({
  x: ring.reduce((sum, corner) => sum + corner.x, 0) / ring.length,
  y: ring.reduce((sum, corner) => sum + corner.y, 0) / ring.length,
})

// A wall face side is named from the wall's start-to-end direction: `left` is the +normal
// side, the left-hand normal (-dy, dx) of that direction in plan, and `right` is the other.
// The side that faces the room is the one whose normal points from the wall's midpoint
// toward the room centroid.
const roomFacingSide = (start: Point, end: Point, room: Point): 'left' | 'right' => {
  const leftNormal = { x: start.y - end.y, y: end.x - start.x }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const towardRoom = (room.x - midpoint.x) * leftNormal.x + (room.y - midpoint.y) * leftNormal.y
  return towardRoom > 0 ? 'left' : 'right'
}

describe('resolveHarnessPaint', () => {
  it('resolves an absent paint param to undefined so the harness stays unpainted', () => {
    expect(resolveHarnessPaint(null)).toBeUndefined()
  })

  it('resolves a non-hex, non-demo string to undefined', () => {
    expect(resolveHarnessPaint('nonsense')).toBeUndefined()
  })

  it('resolves a five-digit string to undefined because it is short of six hex digits', () => {
    expect(resolveHarnessPaint('12345')).toBeUndefined()
  })

  it('resolves a six-character string with a non-hex digit to undefined', () => {
    expect(resolveHarnessPaint('12345g')).toBeUndefined()
  })

  it('resolves a bare six-digit hex swatch to a single-entry floor paint store', () => {
    expect(resolveHarnessPaint('808080')).toEqual({
      [floorKey]: solidTreatment(colorFromHex('#808080'), 'matte'),
    })
  })

  it('resolves an upper-case hex swatch case-insensitively', () => {
    expect(resolveHarnessPaint('CC6633')?.[floorKey]).toEqual(
      solidTreatment(colorFromHex('#cc6633'), 'matte'),
    )
  })

  it('resolves demo to the five-surface demo paint store: the shell floor plus all four walls', () => {
    const store = resolveHarnessPaint('demo')

    expect(store).toBeDefined()
    expect(Object.keys(store ?? {})).toHaveLength(5)
    expect(store?.[floorKey]).toEqual(solidTreatment(colorFromHex('#cc6633'), 'matte'))

    for (const wallId of ['south', 'east', 'north', 'west']) {
      const wallKey = surfaceKey({ kind: 'wall-face', wallId, side: 'right' })
      expect(store?.[wallKey]).toEqual(solidTreatment(colorFromHex('#3f7f5f'), 'matte'))
    }
  })

  it('resolves finish-contrast to a semi-gloss floor and matte walls that share one base color', () => {
    const store = resolveHarnessPaint('finish-contrast')

    const floorTreatment = store?.[floorKey]
    if (floorTreatment?.kind !== 'solid') {
      throw new Error('expected the floor treatment to be a solid treatment')
    }
    expect(floorTreatment.finishId).toBe('semi-gloss')

    const shell = HARNESS_FIXTURES.shell
    const room = centroid(shell.rooms[0]?.polygon ?? [])

    for (const wall of shell.walls) {
      const wallId = wall.id.slice(WALL_ID_PREFIX.length)
      const side = roomFacingSide(wall.start, wall.end, room)
      const wallKey = surfaceKey({ kind: 'wall-face', wallId, side })
      const wallTreatment: SurfaceTreatment | undefined = store?.[wallKey]
      if (wallTreatment?.kind !== 'solid') {
        throw new Error(`expected the ${wallId} wall treatment to be a solid treatment`)
      }
      expect(wallTreatment.finishId).toBe('matte')
      expect(wallTreatment.color.srgbHex).toBe(floorTreatment.color.srgbHex)
    }
  })

  it('paints the finish-contrast walls on the side that faces the room and leaves the exterior side unpainted', () => {
    const store = resolveHarnessPaint('finish-contrast')
    const shell = HARNESS_FIXTURES.shell
    const room = centroid(shell.rooms[0]?.polygon ?? [])
    expect(shell.walls).toHaveLength(4)

    for (const wall of shell.walls) {
      const wallId = wall.id.slice(WALL_ID_PREFIX.length)
      const interior = roomFacingSide(wall.start, wall.end, room)
      const exterior = interior === 'left' ? 'right' : 'left'

      const interiorTreatment = store?.[surfaceKey({ kind: 'wall-face', wallId, side: interior })]
      expect(interiorTreatment?.kind, `${wallId} wall interior (${interior})`).toBe('solid')
      expect(interiorTreatment?.kind === 'solid' && interiorTreatment.finishId).toBe('matte')
      expect(store?.[surfaceKey({ kind: 'wall-face', wallId, side: exterior })]).toBeUndefined()
    }
  })
})
