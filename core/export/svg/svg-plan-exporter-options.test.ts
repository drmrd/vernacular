// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/types'
import { deriveSceneGraph } from '../../scene/scene-graph'
import { SvgPlanExporter, type SvgPlanExportOptions } from './svg-plan-exporter'
import {
  ANNOTATION_LAYERS,
  FIRST_FLOOR_ID,
  SECOND_FLOOR_ID,
  SHAPE_LAYERS,
  createTwoFloorProject,
} from './svg-plan-exporter-test-fixtures'

function exportOf(project: Project, options?: SvgPlanExportOptions): Document {
  const content = new SvgPlanExporter().export(project, options).content
  return new DOMParser().parseFromString(content, 'image/svg+xml')
}

function viewBoxOf(document: Document): string {
  return document.documentElement.getAttribute('viewBox') ?? ''
}

function layersOf(document: Document): string[] {
  return [...document.querySelectorAll('[data-layer]')].map(
    (group) => group.getAttribute('data-layer') ?? '',
  )
}

function nodeIdsOf(document: Document, prefix: string): string[] {
  return [...document.querySelectorAll('[data-node-id]')]
    .map((element) => element.getAttribute('data-node-id') ?? '')
    .filter((id) => id.startsWith(prefix))
}

function withoutDimensions(project: Project): Project {
  return { ...project, floors: project.floors.map((floor) => ({ ...floor, dimensions: [] })) }
}

describe('SvgPlanExporter with annotations left out', () => {
  it('draws the walls and rooms of both floors, with no text and no annotation layer', () => {
    const project = createTwoFloorProject()
    const graph = deriveSceneGraph(project)
    const plain = exportOf(project)

    const document = exportOf(project, { annotations: false })

    expect(layersOf(plain)).toEqual(expect.arrayContaining([...SHAPE_LAYERS, ...ANNOTATION_LAYERS]))
    expect([...new Set(nodeIdsOf(document, 'wall:'))].sort()).toEqual(
      graph.walls.map((wall) => wall.id).sort(),
    )
    expect(nodeIdsOf(document, 'room:').sort()).toEqual(graph.rooms.map((room) => room.id).sort())
    expect(graph.rooms.map((room) => room.floorId).sort()).toEqual([
      FIRST_FLOOR_ID,
      SECOND_FLOOR_ID,
    ])
    expect(document.querySelectorAll('text, tspan')).toHaveLength(0)
    expect(document.documentElement.outerHTML).not.toContain('<text')
    expect(layersOf(document).filter((layer) => ANNOTATION_LAYERS.includes(layer))).toEqual([])
    expect(nodeIdsOf(document, 'dimension:')).toEqual([])
  })

  it('does not widen the view for a dimension that lies outside the walls', () => {
    const project = createTwoFloorProject()
    // The far second floor hides the first floor's dimension in a view of both floors, so
    // the first floor alone is the view in which the dimension would show.
    const firstFloor = { floorIds: [FIRST_FLOOR_ID] }
    const alone = { ...firstFloor, annotations: false }
    const noDimensions = withoutDimensions(project)

    expect(viewBoxOf(exportOf(project, alone))).toBe(viewBoxOf(exportOf(noDimensions, firstFloor)))
    expect(viewBoxOf(exportOf(project, alone))).not.toBe(viewBoxOf(exportOf(project, firstFloor)))
    expect(viewBoxOf(exportOf(project, { annotations: false }))).toBe(
      viewBoxOf(exportOf(noDimensions)),
    )
  })
})

describe('SvgPlanExporter with a list of floor ids', () => {
  it('draws no shape for an empty list', () => {
    const document = exportOf(createTwoFloorProject(), { floorIds: [] })

    expect(document.querySelectorAll('parsererror')).toHaveLength(0)
    expect(document.querySelectorAll('line, polygon, text')).toHaveLength(0)
    expect(nodeIdsOf(document, '')).toEqual([])
  })

  it('draws the walls of both floors, in the view that no option gives, when it names both', () => {
    const project = createTwoFloorProject()
    const graph = deriveSceneGraph(project)

    const document = exportOf(project, { floorIds: [FIRST_FLOOR_ID, SECOND_FLOOR_ID] })

    expect([...new Set(nodeIdsOf(document, 'wall:'))].sort()).toEqual(
      graph.walls.map((wall) => wall.id).sort(),
    )
    expect(new Set(graph.walls.map((wall) => wall.floorId))).toEqual(
      new Set([FIRST_FLOOR_ID, SECOND_FLOOR_ID]),
    )
    expect(viewBoxOf(document)).toBe(viewBoxOf(exportOf(project)))
  })
})
