import { describe, expect, it } from 'vitest'
import { openingRoomSide } from '../../core'
import { HARNESS_FIXTURES } from './harness-fixtures'

describe('the shell fixture with a south window', () => {
  const fixture = HARNESS_FIXTURES['shell-south-window']

  it('has the walls and rooms of the shell', () => {
    expect(fixture).toBeDefined()
    expect(fixture.walls).toEqual(HARNESS_FIXTURES.shell.walls)
    expect(fixture.rooms).toEqual(HARNESS_FIXTURES.shell.rooms)
  })

  it('has the two openings of the shell plus a double-hung window in the south wall', () => {
    expect(fixture).toBeDefined()
    expect(fixture.openings).toHaveLength(3)
    expect(fixture.openings.slice(0, 2)).toEqual(HARNESS_FIXTURES.shell.openings)
    expect(fixture.openings[2]).toMatchObject({
      id: 'opening:south-window',
      type: 'double-hung-window',
      hostWallId: 'south',
      center: { x: 800, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: 1000,
      height: 1200,
      sillHeight: 900,
      hostThickness: 120,
    })
  })

  it('places the window clear of the door along the south wall', () => {
    expect(fixture).toBeDefined()
    const window = fixture.openings.find((o) => o.id === 'opening:south-window')
    const door = fixture.openings.find((o) => o.id === 'opening:south-door')
    expect(window).toBeDefined()
    expect(door).toBeDefined()
    const windowEnd = window!.center.x + window!.width / 2
    const doorStart = door!.center.x - door!.width / 2
    expect(windowEnd).toBeLessThanOrEqual(doorStart)
  })
})

describe('the shell fixture', () => {
  it('still has exactly two openings', () => {
    expect(HARNESS_FIXTURES.shell.openings).toHaveLength(2)
  })
})

describe('the room side of the harness openings', () => {
  // The literal shell walls are 120 mm thick with no construction profile, so the raw thickness
  // of a host wall equals the effective thickness that each opening carries as `hostThickness`.
  const cases = Object.entries(HARNESS_FIXTURES).flatMap(([name, fixture]) =>
    fixture.openings.map((opening) => ({ name, fixture, opening })),
  )

  it.each(cases)(
    'gives $opening.id of the $name fixture the room side that the rule finds at it',
    ({ fixture, opening }) => {
      const expected = openingRoomSide(opening, fixture.rooms, opening.hostThickness)
      expect(opening.roomSide).toBe(expected)
    },
  )

  it.each(cases)(
    'carries the room side key of $opening.id of the $name fixture only when the rule finds a side',
    ({ fixture, opening }) => {
      const expected = openingRoomSide(opening, fixture.rooms, opening.hostThickness)
      expect('roomSide' in opening).toBe(expected !== undefined)
    },
  )

  it('puts the south door of the shell on the positive side', () => {
    const door = HARNESS_FIXTURES.shell.openings.find((o) => o.id === 'opening:south-door')
    expect(door?.roomSide).toBe('positive')
  })

  it('puts the east window of the shell on the negative side', () => {
    const window = HARNESS_FIXTURES.shell.openings.find((o) => o.id === 'opening:east-window')
    expect(window?.roomSide).toBe('negative')
  })

  it('puts the south window of the shell with a south window on the positive side', () => {
    const window = HARNESS_FIXTURES['shell-south-window'].openings.find(
      (o) => o.id === 'opening:south-window',
    )
    expect(window?.roomSide).toBe('positive')
  })
})
