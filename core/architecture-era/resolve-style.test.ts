// core/architecture-era/resolve-style.test.ts
import { describe, expect, it } from 'vitest'
import { resolveStyle } from './resolve-style'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Project } from '../model/types'

const ROOM_KEY = 'wall-a|wall-b'

function project(): Project {
  const base = createEmptyProject({
    name: 'House',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  base.floors = [createFloor('Ground', { id: 'floor-1' })]
  return base
}

describe('resolveStyle', () => {
  it('returns undefined when no level carries a style', () => {
    expect(resolveStyle(project(), 'floor-1')).toBeUndefined()
  })

  it('prefers a floor style over the absent project style', () => {
    const subject = project()
    subject.floors[0]!.styleOverride = { styleId: 'queen-anne' }
    expect(resolveStyle(subject, 'floor-1')).toEqual({ styleId: 'queen-anne' })
  })

  it('prefers a room style over the floor style', () => {
    const subject = project()
    subject.floors[0]!.styleOverride = { styleId: 'queen-anne' }
    subject.roomOverrides = {
      [ROOM_KEY]: { styleOverride: { styleId: 'gothic-revival', vernacular: true } },
    }
    expect(resolveStyle(subject, 'floor-1', ROOM_KEY)).toEqual({
      styleId: 'gothic-revival',
      vernacular: true,
    })
  })
})
