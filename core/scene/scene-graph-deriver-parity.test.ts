import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createStair,
  createWall,
} from '../model/factories'
import type { Floor, Project } from '../model/types'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

const RAISED_FOUNDATION_GRADE_MM = -600
const DAYLIGHT_BASEMENT_GRADE_MM = -1800

/** A ground floor with a closed wall loop, a door, and a sofa, so every node kind is present. */
function furnishedGroundFloor(): Floor {
  const ground = createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w-south' }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'w-east' }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { id: 'w-north' }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { id: 'w-west' }),
    ],
  })
  const door = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w-south',
    position: 1000,
    width: 800,
    id: 'o1',
  })
  const sofa = createFurnitureInstance({
    id: 'sofa-1',
    assetRef: { scope: 'project', contentHash: 'sofac0de' },
    position: { x: 1500, y: 900 },
    footprint: { width: 2000, depth: 900 },
    rotation: 30,
    elevationZ: 50,
    height: 800,
  })
  return { ...ground, openings: [door], furniture: [sofa] }
}

function twoStoreyProject(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [furnishedGroundFloor(), createFloor('Upper', { id: 'u', elevation: 2800 })]
  project.stairs = [createStair({ id: 's1', connection: { fromFloorId: 'g', toFloorId: 'u' } })]
  return project
}

describe('createSceneGraphDeriver parity with deriveSceneGraph', () => {
  it('derives the same scene graph as the pure projection when a site grade is set', () => {
    const project = { ...twoStoreyProject(), site: { gradeElevation: RAISED_FOUNDATION_GRADE_MM } }

    expect(createSceneGraphDeriver()(project)).toStrictEqual(deriveSceneGraph(project))
  })

  it('derives the same scene graph as the pure projection when no site grade is set', () => {
    const project = twoStoreyProject()

    expect(createSceneGraphDeriver()(project)).toStrictEqual(deriveSceneGraph(project))
  })

  it('follows a site grade edit that keeps every floor reference', () => {
    const project = { ...twoStoreyProject(), site: { gradeElevation: RAISED_FOUNDATION_GRADE_MM } }
    const derive = createSceneGraphDeriver()
    derive(project)

    const regraded = { ...project, site: { gradeElevation: DAYLIGHT_BASEMENT_GRADE_MM } }

    expect(derive(regraded).gradeElevation).toBe(DAYLIGHT_BASEMENT_GRADE_MM)
  })
})
