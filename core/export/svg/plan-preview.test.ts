// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createOpening, createWall } from '../../model/factories'
import type { Project } from '../../model/types'
import { deriveSceneGraph } from '../../scene/scene-graph'
import { roomKey } from '../../topology/rooms'
import { createPlanPreview } from './plan-preview'
import { SvgPlanExporter } from './svg-plan-exporter'
import {
  DEFAULT_MARGIN_MM,
  FIRST_FLOOR_DEPTH_MM,
  FIRST_FLOOR_DOOR_OVERHANG_MM,
  FIRST_FLOOR_ID,
  FIRST_FLOOR_ROOM_NAME,
  FIRST_FLOOR_WIDTH_MM,
  SECOND_FLOOR_ID,
  SECOND_FLOOR_ROOM_NAME,
  SHAPE_LAYERS,
  createTwoFloorProject,
} from './svg-plan-exporter-test-fixtures'

const ALLOWED_ELEMENTS = ['svg', 'g', 'line', 'polygon']
const ALLOWED_ATTRIBUTES = [
  'xmlns',
  'viewBox',
  'width',
  'height',
  'data-layer',
  'data-node-id',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'fill',
]
const MARKUP_ID = 'x"><script>alert(1)</script>&'
const MARKUP_WALL_IDS = ['a', 'b', 'c', 'd'].map((letter) => `${MARKUP_ID}${letter}`)
const MARKUP_ROOM_NAME = '<b onload="alert(1)">Hall</b> & "more"'
const SIDE_MM = 3000

function parse(content: string): Document {
  return new DOMParser().parseFromString(content, 'image/svg+xml')
}

function everyElement(document: Document): Element[] {
  return [document.documentElement, ...document.querySelectorAll('*')]
}

function previewOf(project: Project): string {
  const preview = createPlanPreview(project)
  if (preview === undefined) {
    throw new Error('expected a preview for a project with a floor')
  }
  return preview
}

function nodeIds(document: Document, prefix: string): string[] {
  return [...document.querySelectorAll('[data-node-id]')]
    .map((element) => element.getAttribute('data-node-id') ?? '')
    .filter((id) => id.startsWith(prefix))
}

function firstFloorOf(project: Project) {
  const [first] = project.floors
  if (first === undefined) {
    throw new Error('expected the fixture to carry a first floor')
  }
  return first
}

function frameOf(content: string): string[] {
  const root = parse(content).documentElement
  return ['viewBox', 'width', 'height'].map((name) => root.getAttribute(name) ?? '')
}

function textsOf(content: string): string[] {
  return [...parse(content).querySelectorAll('text, tspan')].map((node) => node.textContent ?? '')
}

/** A project whose first floor is a room with markup characters in its wall ids and name. */
function projectWithMarkupIds(): Project {
  const wallIds = MARKUP_WALL_IDS
  const corners = [
    { x: 0, y: 0 },
    { x: SIDE_MM, y: 0 },
    { x: SIDE_MM, y: SIDE_MM },
    { x: 0, y: SIDE_MM },
  ]
  const walls = corners.map((start, index) =>
    createWall(start, corners[(index + 1) % corners.length] ?? start, {
      id: wallIds[index] ?? MARKUP_ID,
    }),
  )
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: MARKUP_WALL_IDS[0] ?? MARKUP_ID,
    position: SIDE_MM / 2,
    id: MARKUP_ID,
  })
  const floor = { ...createFloor('Ground', { id: MARKUP_ID, walls }), openings: [opening] }
  const base = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  const key = roomKey({ wallIds: MARKUP_WALL_IDS })
  return { ...base, floors: [floor], roomOverrides: { [key]: { name: MARKUP_ROOM_NAME } } }
}

/** The two-floor project with nothing at all on its first floor. */
function projectWithEmptyFirstFloor(): Project {
  const project = createTwoFloorProject()
  const [, second] = project.floors
  if (second === undefined) {
    throw new Error('expected the fixture to carry a second floor')
  }
  return { ...project, floors: [createFloor('Empty', { id: 'floor-empty' }), second] }
}

describe('createPlanPreview', () => {
  it('the preview has no text element', () => {
    const preview = previewOf(createTwoFloorProject())
    const document = parse(preview)

    expect(preview).not.toContain('<text')
    expect(document.querySelectorAll('text, tspan')).toHaveLength(0)
    expect((document.documentElement.textContent ?? '').replace(/\s/g, '')).toBe('')
  })

  it('every wall drawn is a wall of the first floor', () => {
    const project = createTwoFloorProject()
    const firstFloorWalls = deriveSceneGraph(project)
      .walls.filter((wall) => wall.floorId === FIRST_FLOOR_ID)
      .map((wall) => wall.id)

    const drawn = new Set(nodeIds(parse(previewOf(project)), 'wall:'))

    expect(firstFloorWalls.length).toBeGreaterThan(0)
    expect([...drawn].sort()).toEqual([...firstFloorWalls].sort())
  })

  it('a project with no floor gives undefined', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })

    expect(createPlanPreview(project)).toBeUndefined()
  })

  it('the preview has no script element, no event attribute, and no external reference', () => {
    const preview = previewOf(createTwoFloorProject())
    const attributeNames = everyElement(parse(preview)).flatMap((element) =>
      element.getAttributeNames(),
    )

    for (const forbidden of ['<script', 'url(', '<image', '<use', '<foreignObject', '<style']) {
      expect(preview).not.toContain(forbidden)
    }
    expect(attributeNames.filter((name) => name.startsWith('on'))).toEqual([])
    expect(attributeNames.filter((name) => name.toLowerCase().endsWith('href'))).toEqual([])
    expect(preview).not.toContain('href')
  })

  it('the preview uses only svg, g, line, and polygon elements, with the known attributes', () => {
    const elements = everyElement(parse(previewOf(createTwoFloorProject())))
    const names = new Set(elements.map((element) => element.localName))
    const attributes = new Set(elements.flatMap((element) => element.getAttributeNames()))

    expect([...names].filter((name) => !ALLOWED_ELEMENTS.includes(name))).toEqual([])
    expect([...attributes].filter((name) => !ALLOWED_ATTRIBUTES.includes(name))).toEqual([])
    expect(names.has('line') && names.has('polygon')).toBe(true)
  })

  it('the rooms and the openings of the first floor are drawn, and none of the second floor', () => {
    const project = createTwoFloorProject()
    const graph = deriveSceneGraph(project)
    const idsOn = (nodes: { id: string; floorId: string }[], floorId: string) =>
      nodes.filter((node) => node.floorId === floorId).map((node) => node.id)
    const document = parse(previewOf(project))

    expect(idsOn(graph.rooms, FIRST_FLOOR_ID)).toHaveLength(1)
    expect(idsOn(graph.openings, FIRST_FLOOR_ID)).toHaveLength(1)
    expect(nodeIds(document, 'room:')).toEqual(idsOn(graph.rooms, FIRST_FLOOR_ID))
    expect(nodeIds(document, 'opening:')).toEqual(idsOn(graph.openings, FIRST_FLOOR_ID))
    expect(idsOn(graph.rooms, SECOND_FLOOR_ID)).toHaveLength(1)
    expect(idsOn(graph.openings, SECOND_FLOOR_ID)).toHaveLength(1)
  })

  it('no dimension line and no room label of the first floor is drawn', () => {
    const project = createTwoFloorProject()
    const firstFloor = firstFloorOf(project)
    const document = parse(previewOf(project))

    expect(firstFloor.dimensions).toHaveLength(1)
    expect(nodeIds(document, 'dimension:')).toEqual([])
    expect(document.querySelectorAll('text, tspan')).toHaveLength(0)
    expect(previewOf(project)).not.toContain(FIRST_FLOOR_ROOM_NAME)
  })

  it('the view fits the first floor: a far wall of the second floor and a dimension of the first do not widen it', () => {
    const project = createTwoFloorProject()
    const firstFloor = firstFloorOf(project)
    const firstFloorAlone: Project = {
      ...project,
      floors: [{ ...firstFloor, dimensions: [] }],
    }
    const wholePlan = new SvgPlanExporter().export(project).content

    expect(frameOf(previewOf(project))).toEqual(frameOf(previewOf(firstFloorAlone)))
    expect(frameOf(previewOf(project))).not.toEqual(frameOf(wholePlan))
  })

  it('a first floor with nothing drawn gives a drawing with no shape', () => {
    const preview = previewOf(projectWithEmptyFirstFloor())
    const document = parse(preview)

    expect(document.documentElement.localName).toBe('svg')
    expect(document.querySelectorAll('line, polygon')).toHaveLength(0)
    expect(document.querySelectorAll('parsererror')).toHaveLength(0)
  })

  it('the same project gives the same text twice, and the project is not changed', () => {
    const project = createTwoFloorProject()
    const untouched = structuredClone(project)

    const first = createPlanPreview(project)
    const second = createPlanPreview(createTwoFloorProject())

    expect(first).toBeDefined()
    expect(first).toBe(second)
    expect(project).toEqual(untouched)
  })

  it('an id and a room name with markup characters add no element', () => {
    const preview = previewOf(projectWithMarkupIds())
    const document = parse(preview)
    const names = new Set(everyElement(document).map((element) => element.localName))
    const attributeNames = everyElement(document).flatMap((element) => element.getAttributeNames())

    expect(document.querySelectorAll('parsererror')).toHaveLength(0)
    expect([...names].filter((name) => !ALLOWED_ELEMENTS.includes(name))).toEqual([])
    expect(attributeNames.filter((name) => !ALLOWED_ATTRIBUTES.includes(name))).toEqual([])
    expect(preview).not.toContain('<script')
    expect(nodeIds(document, 'wall:').length).toBeGreaterThan(0)
    expect(nodeIds(document, 'wall:')).toContain(`wall:${MARKUP_ID}a`)
  })
})

describe('SvgPlanExporter floor and annotation options', () => {
  it('the plan exporter with floorIds and annotations left on draws the labels of that floor only', () => {
    const project = createTwoFloorProject()
    const firstFloorAlone: Project = { ...project, floors: [firstFloorOf(project)] }

    const texts = textsOf(
      new SvgPlanExporter().export(project, { floorIds: [FIRST_FLOOR_ID] }).content,
    )

    expect(texts).toContain(FIRST_FLOOR_ROOM_NAME)
    expect(texts).not.toContain(SECOND_FLOOR_ROOM_NAME)
    expect(texts).toEqual(textsOf(new SvgPlanExporter().export(firstFloorAlone).content))
  })

  it('the plan exporter with an id that names no floor draws no shape', () => {
    const content = new SvgPlanExporter().export(createTwoFloorProject(), {
      floorIds: ['no-such-floor'],
    }).content
    const document = parse(content)

    expect(document.querySelectorAll('line, polygon, text')).toHaveLength(0)
    expect(nodeIds(document, '')).toEqual([])
  })

  it('the plan exporter with no option draws every floor with its labels and dimensions', () => {
    const project = createTwoFloorProject()
    const graph = deriveSceneGraph(project)
    const content = new SvgPlanExporter().export(project).content
    const document = parse(content)

    // A wall that an opening cuts is drawn as two lines, so compare the set of ids.
    expect([...new Set(nodeIds(document, 'wall:'))].sort()).toEqual(
      graph.walls.map((wall) => wall.id).sort(),
    )
    expect(nodeIds(document, 'dimension:').sort()).toEqual(
      graph.dimensions.map((dimension) => dimension.id).sort(),
    )
    expect(graph.dimensions).toHaveLength(2)
    expect(textsOf(content)).toContain(FIRST_FLOOR_ROOM_NAME)
    expect(textsOf(content)).toContain(SECOND_FLOOR_ROOM_NAME)
  })
})

describe('createPlanPreview frame and layers', () => {
  it('the preview starts with the XML declaration and carries the SVG namespace', () => {
    const preview = previewOf(createTwoFloorProject())

    expect(preview.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(parse(preview).documentElement.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
  })

  it('the preview is the size of the first floor in millimetres plus the default margin on each side', () => {
    const root = parse(previewOf(createTwoFloorProject())).documentElement
    const margins = 2 * DEFAULT_MARGIN_MM

    expect(Number(root.getAttribute('width'))).toBe(FIRST_FLOOR_WIDTH_MM + margins)
    expect(Number(root.getAttribute('height'))).toBe(
      FIRST_FLOOR_DEPTH_MM + FIRST_FLOOR_DOOR_OVERHANG_MM + margins,
    )
    expect(root.getAttribute('viewBox')).toBe(
      `0 0 ${root.getAttribute('width')} ${root.getAttribute('height')}`,
    )
  })

  it('the preview holds the layers of the rooms, walls, and openings only', () => {
    const layers = [...parse(previewOf(createTwoFloorProject())).querySelectorAll('[data-layer]')]

    expect(layers.map((group) => group.getAttribute('data-layer')).sort()).toEqual(
      [...SHAPE_LAYERS].sort(),
    )
  })

  it('a first floor with nothing drawn keeps the three layers, with nothing in them', () => {
    const layers = [
      ...parse(previewOf(projectWithEmptyFirstFloor())).querySelectorAll('[data-layer]'),
    ]

    expect(layers.map((group) => group.getAttribute('data-layer')).sort()).toEqual(
      [...SHAPE_LAYERS].sort(),
    )
    expect(layers.map((group) => group.children.length)).toEqual(layers.map(() => 0))
  })
})
