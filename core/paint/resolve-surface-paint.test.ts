import { describe, expect, it } from 'vitest'
import { resolveSurfacePaint } from './resolve-surface-paint'
import { surfaceKey, type SurfaceRef } from '../model/paint'
import { colorFromHex } from '../color/color'
import { createEmptyProject } from '../model/factories'
import type { Project } from '../model/types'

const REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

describe('resolveSurfacePaint', () => {
  it('returns undefined for an unpainted surface', () => {
    expect(resolveSurfacePaint(newProject(), REF)).toBeUndefined()
  })

  it('returns the assignment for a painted surface', () => {
    const project = newProject()
    const assignment = { color: colorFromHex('#9aa583'), finishId: 'satin' }
    project.paint = { [surfaceKey(REF)]: assignment }
    expect(resolveSurfacePaint(project, REF)).toEqual(assignment)
  })
})
