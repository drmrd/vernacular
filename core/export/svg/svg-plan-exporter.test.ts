// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../../model/factories'
import type { Project } from '../../model/types'
import { SvgPlanExporter } from './svg-plan-exporter'

/**
 * Build a deterministic project with one floor and a single horizontal wall.
 * Ids are fixed so two independent builds are byte-identical and deep-equal,
 * which the determinism and no-mutation behaviors below rely on.
 */
function createSingleWallProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' })
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls: [wall] })
  return {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [floor],
  }
}

/** Build a deterministic project with one floor and two walls forming a corner. */
function createTwoWallProject(): Project {
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' }),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'wall-b' }),
  ]
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls })
  return {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [floor],
  }
}

describe('SvgPlanExporter emitting walls', () => {
  it('returns an SVG export result with the svg media type and extension', () => {
    const project = createSingleWallProject()

    const result = new SvgPlanExporter().export(project)

    expect(result.media).toBe('image/svg+xml')
    expect(result.extension).toBe('svg')
    expect(result.content).toContain('<svg')
    expect(result.content.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('emits one line per wall with projected endpoints and the wall node id', () => {
    const project = createTwoWallProject()

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const lines = document.querySelectorAll('line')

    expect(lines).toHaveLength(2)
    for (const line of lines) {
      const nodeId = line.getAttribute('data-node-id')
      expect(nodeId).not.toBeNull()
      expect(nodeId?.startsWith('wall:')).toBe(true)
    }
  })

  it('is deterministic: equal projects yield byte-identical SVG', () => {
    const first = new SvgPlanExporter().export(createSingleWallProject())
    const second = new SvgPlanExporter().export(createSingleWallProject())

    expect(first.content).toBe(second.content)
  })

  it('does not mutate the project', () => {
    const project = createSingleWallProject()
    const untouched = createSingleWallProject()

    new SvgPlanExporter().export(project)

    expect(project).toEqual(untouched)
  })
})
