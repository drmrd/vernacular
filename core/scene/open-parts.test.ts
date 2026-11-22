import { describe, expect, it } from 'vitest'

import {
  openOpeningIds,
  sameOpenParts,
  toggleOpenPart,
  type OpenParts,
  type OpeningPartId,
} from '../index'

const WINDOW_ID = 'w'
const DOOR_ID = 'd'

function partsOf(...ids: OpeningPartId[]): ReadonlySet<OpeningPartId> {
  return new Set(ids)
}

describe('toggleOpenPart', () => {
  it('opens one part of an opening', () => {
    const opened = toggleOpenPart(new Map(), { openingId: WINDOW_ID, part: 'upper' })

    expect(opened.get(WINDOW_ID)).toEqual(partsOf('upper'))
  })

  it('opens the second sash beside the first', () => {
    const first = toggleOpenPart(new Map(), { openingId: WINDOW_ID, part: 'upper' })

    const both = toggleOpenPart(first, { openingId: WINDOW_ID, part: 'lower' })

    expect(both.get(WINDOW_ID)).toEqual(partsOf('upper', 'lower'))
    expect(both.get(WINDOW_ID)?.size).toBe(2)
  })

  it('removes the opening when its last open part shuts', () => {
    const ref = { openingId: WINDOW_ID, part: 'upper' } as const
    const opened = toggleOpenPart(new Map(), ref)

    const shut = toggleOpenPart(opened, ref)

    expect(shut.has(WINDOW_ID)).toBe(false)
    expect(shut.size).toBe(0)
  })

  it('never changes the map or the set it was given', () => {
    const empty: OpenParts = new Map()
    const upperOnly = partsOf('upper')
    const one: OpenParts = new Map([[WINDOW_ID, upperOnly]])

    toggleOpenPart(empty, { openingId: WINDOW_ID, part: 'upper' })
    toggleOpenPart(one, { openingId: WINDOW_ID, part: 'lower' })

    expect(empty.size).toBe(0)
    expect(upperOnly.size).toBe(1)
    expect(one.get(WINDOW_ID)).toBe(upperOnly)
  })
})

describe('openOpeningIds', () => {
  it('lists the ids of the openings with any part open', () => {
    const parts: OpenParts = new Map([
      [WINDOW_ID, partsOf('upper')],
      [DOOR_ID, partsOf('primary')],
    ])

    expect(openOpeningIds(parts)).toEqual(new Set([WINDOW_ID, DOOR_ID]))
  })
})

describe('sameOpenParts', () => {
  it('compares two maps by their opening ids and parts, not by instance', () => {
    const windowUpper: OpenParts = new Map([[WINDOW_ID, partsOf('upper')]])
    const windowUpperAgain: OpenParts = new Map([[WINDOW_ID, partsOf('upper')]])
    const windowLower: OpenParts = new Map([[WINDOW_ID, partsOf('lower')]])
    const windowAndDoor: OpenParts = new Map([
      [WINDOW_ID, partsOf('upper')],
      [DOOR_ID, partsOf('primary')],
    ])

    expect(sameOpenParts(windowUpper, windowUpperAgain)).toBe(true)
    expect(sameOpenParts(windowUpper, windowLower)).toBe(false)
    expect(sameOpenParts(windowUpper, windowAndDoor)).toBe(false)
    expect(sameOpenParts(new Map(), new Map())).toBe(true)
  })
})
