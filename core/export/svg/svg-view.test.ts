import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../../model/factories'
import type { Project } from '../../model/types'
import { deriveSceneGraph } from '../../scene/scene-graph'
import { createSvgView, planContentBounds } from './svg-view'
import type { PlanBounds } from './svg-view'

function emptyHouse(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
}

describe('planContentBounds', () => {
  it('bounds a plan from its wall, room, opening, and dimension geometry', () => {
    const project = emptyHouse()
    project.floors = [
      createFloor('Ground', {
        id: 'g',
        walls: [
          createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w1' }),
          createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'w2' }),
        ],
      }),
    ]
    const graph = deriveSceneGraph(project)

    expect(planContentBounds(graph)).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 4000, y: 3000 },
    })
  })

  it('returns null content bounds for an empty plan', () => {
    const project = emptyHouse()
    project.floors = [createFloor('Ground', { id: 'g' })]
    const graph = deriveSceneGraph(project)

    expect(planContentBounds(graph)).toBeNull()
  })
})

describe('createSvgView', () => {
  it('maps world y-up millimeters to SVG y-down user units within a margin', () => {
    const bounds: PlanBounds = { min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } }
    const view = createSvgView(bounds, { marginMm: 100 })

    expect(view.width).toBe(4200)
    expect(view.height).toBe(3200)
    // Top-left of content (largest world y) maps to the smallest SVG y.
    expect(view.project({ x: 0, y: 3000 })).toEqual({ x: 100, y: 100 })
    // Bottom-left of content (smallest world y) maps to the largest SVG y.
    expect(view.project({ x: 0, y: 0 })).toEqual({ x: 100, y: 3100 })
    // The y axis is flipped: a larger world y yields a smaller SVG y.
    expect(view.project({ x: 0, y: 3000 }).y).toBeLessThan(view.project({ x: 0, y: 0 }).y)
  })

  it('builds a minimal margin-only view for null bounds', () => {
    const view = createSvgView(null)

    expect(view.width).toBe(200)
    expect(view.height).toBe(200)
    expect(view.width).toBeGreaterThan(0)
    expect(view.height).toBeGreaterThan(0)

    const projected = view.project({ x: 0, y: 0 })
    expect(Number.isFinite(projected.x)).toBe(true)
    expect(Number.isFinite(projected.y)).toBe(true)
  })
})
