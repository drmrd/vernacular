import { expect, it } from 'vitest'
import { twoRoomWalls } from './plan-geometry-test-support'
import { deriveRooms } from './rooms'

it('returns a new array from each call of deriveRooms', () => {
  const walls = twoRoomWalls()
  const first = deriveRooms(walls)
  const second = deriveRooms(walls)
  const whole = [...second]

  first.splice(0)

  expect(first).not.toBe(second)
  expect(second).toEqual(whole)
  expect(deriveRooms(walls)).toEqual(whole)
  expect(whole).toHaveLength(2)
})
