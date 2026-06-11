import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ROOM_PURPOSE_REGISTRY_VERSION, builtinRoomPurposes } from './room-purposes'

describe('builtin room purposes', () => {
  it('seeds the MVP room purposes with the registry version', () => {
    expect(builtinRoomPurposes.version).toBe(ROOM_PURPOSE_REGISTRY_VERSION)
    expect(getEntry(builtinRoomPurposes, 'kitchen')?.displayName['en-US']).toBe('Kitchen')
    expect(getEntry(builtinRoomPurposes, 'bedroom')?.displayName['en-US']).toBe('Bedroom')
  })

  it('includes historic reception and service purposes', () => {
    expect(getEntry(builtinRoomPurposes, 'parlor')?.displayName['en-US']).toBe('Parlor')
    expect(getEntry(builtinRoomPurposes, 'scullery')?.displayName['en-US']).toBe('Scullery')
    expect(getEntry(builtinRoomPurposes, 'butlers-pantry')?.displayName['en-US']).toBe(
      "Butler's Pantry",
    )
  })

  it('includes the explicit other catch-all purpose', () => {
    expect(getEntry(builtinRoomPurposes, 'other')?.displayName['en-US']).toBe('Other')
  })
})
