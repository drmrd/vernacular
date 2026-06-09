import { describe, expect, it } from 'vitest'
import type { OverlayEntity } from './overlay-entities'
import type { SnapResult } from './snap'
import { selectionAnnouncement, snapAnnouncement } from './overlay-announce'

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
})
