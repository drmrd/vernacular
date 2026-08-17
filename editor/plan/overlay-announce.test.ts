import { describe, expect, it } from 'vitest'
import type { OverlayEntity } from './overlay-entities'
import type { SnapResult } from './snap'
import {
  angleLockAnnouncement,
  placementRefusalMessage,
  selectionAnnouncement,
  snapAnnouncement,
  snapStatusLabel,
} from './overlay-announce'

const ORIGIN = { x: 0, y: 0 }
const WALL_LABEL = 'Wall, 3000 mm'
const ROOM_LABEL = 'Living Room'

function entity(label: string): OverlayEntity {
  return { id: `entity:${label}`, kind: 'wall', label, anchor: ORIGIN, selected: true }
}

describe('selectionAnnouncement', () => {
  it('reports a cleared selection when nothing is selected', () => {
    expect(selectionAnnouncement([])).toBe('Selection cleared')
  })

  it('names the single selected entity by its label', () => {
    expect(selectionAnnouncement([entity(WALL_LABEL)])).toBe(`Selected ${WALL_LABEL}`)
  })

  it('reports the count when two entities are selected', () => {
    expect(selectionAnnouncement([entity(WALL_LABEL), entity(ROOM_LABEL)])).toBe('2 items selected')
  })

  it('generalizes the count beyond two entities', () => {
    const three = [entity(WALL_LABEL), entity(ROOM_LABEL), entity('Opening, 900 mm')]
    expect(selectionAnnouncement(three)).toBe('3 items selected')
  })
})

describe('snapAnnouncement', () => {
  it('announces nothing when there is no active snap', () => {
    expect(snapAnnouncement(null)).toBe('')
  })

  it('names an endpoint snap by its kind', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'endpoint' }
    expect(snapAnnouncement(snap)).toBe('Snapped to endpoint')
  })

  it('names a grid snap by its kind', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'grid' }
    expect(snapAnnouncement(snap)).toBe('Snapped to grid')
  })

  it('names a trace snap the way the snapping panel names it', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'trace' }
    expect(snapAnnouncement(snap)).toBe('Snapped to underlay corners')
  })

  it('names an angle snap as the lock the panel offers', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'angle' }
    expect(snapAnnouncement(snap)).toBe('Snapped to angle lock')
  })
})

describe('placementRefusalMessage', () => {
  it('tells a click that missed every wall what the opening needed', () => {
    expect(placementRefusalMessage('no-host-wall')).toBe('No wall here to host the opening')
  })

  it('distinguishes an overlap from a miss', () => {
    expect(placementRefusalMessage('opening-overlap')).toBe(
      'That would overlap an opening already in this wall',
    )
  })

  it('names the missing floor a stair would rise to, and what to do about it', () => {
    expect(placementRefusalMessage('no-floor-above')).toBe('Add a floor above to place stairs')
  })
})

describe('angleLockAnnouncement', () => {
  it('names the locked bearing in whole degrees', () => {
    expect(angleLockAnnouncement(45)).toBe('Locked to 45 degrees')
  })

  it('rounds the bearing to a whole number', () => {
    expect(angleLockAnnouncement(89.6)).toBe('Locked to 90 degrees')
  })
})

describe('snapStatusLabel', () => {
  it('is empty when nothing is snapping', () => {
    expect(snapStatusLabel(null)).toBe('')
  })

  it('names the engaged snap kind for a visible status readout', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'endpoint' }
    expect(snapStatusLabel(snap)).toBe('Snap: Endpoint')
  })

  it('reads a trace snap as the underlay corners the panel offers, not the raw id', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'trace' }
    expect(snapStatusLabel(snap)).toBe('Snap: Underlay corners')
  })

  it('title-cases the label the way the snapping panel does', () => {
    const snap: SnapResult = { point: ORIGIN, kind: 'perpendicular' }
    expect(snapStatusLabel(snap)).toBe('Snap: Perpendicular')
  })
})
