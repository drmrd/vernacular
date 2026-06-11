// core/architecture-era/resolve-period.test.ts
import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './resolve-period'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Project } from '../model/types'

const ROOM_KEY = 'wall-a-wall-b'

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

describe('resolvePeriod', () => {
  it('falls back to the project period when nothing is overridden', () => {
    expect(resolvePeriod(project(), 'floor-1')).toBe('victorian')
  })

  it('prefers a floor override over the project period', () => {
    const subject = project()
    subject.floors[0]!.periodOverride = 'edwardian'
    expect(resolvePeriod(subject, 'floor-1')).toBe('edwardian')
  })

  it('prefers a room override over the floor and project period', () => {
    const subject = project()
    subject.floors[0]!.periodOverride = 'edwardian'
    subject.roomOverrides = { [ROOM_KEY]: { periodOverride: 'interwar' } }
    expect(resolvePeriod(subject, 'floor-1', ROOM_KEY)).toBe('interwar')
  })

  it('falls back to the project period for an unknown floor', () => {
    expect(resolvePeriod(project(), 'no-such-floor')).toBe('victorian')
  })
})
