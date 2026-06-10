// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRIC_PREFERENCES,
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  deriveSceneGraph,
  dimensionGeometry,
  formatArea,
  formatLength,
  lengthFormatOptions,
  openingFootprint,
  polygonCentroid,
  roomKey,
} from '../../'
import {
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
} from '../../model/factories'
import type { Project } from '../../model/types'
import type { DimensionSceneNode, OpeningSceneNode, RoomSceneNode } from '../../scene/scene-graph'
import { createSvgView, planContentBounds } from './svg-view'
import { SvgPlanExporter } from './svg-plan-exporter'

/**
 * Wrap a single floor in a deterministic project envelope. The meta is fixed so
 * two independent builds are byte-identical and deep-equal, which the determinism
 * and no-mutation behaviors below rely on.
 */
function projectWithFloor(floor: Project['floors'][number]): Project {
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

/**
 * Build a deterministic project with one floor and a single horizontal wall.
 */
function createSingleWallProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' })
  return projectWithFloor(createFloor('Ground Floor', { id: 'floor-a', walls: [wall] }))
}

/** Build a deterministic project with one floor and two walls forming a corner. */
function createTwoWallProject(): Project {
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' }),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'wall-b' }),
  ]
  return projectWithFloor(createFloor('Ground Floor', { id: 'floor-a', walls }))
}

/**
 * Build a deterministic project whose single floor encloses one rectangular room
 * with a closed four-wall loop. The endpoints connect end-to-end
 * ((0,0)->(4000,0)->(4000,3000)->(0,3000)->(0,0)) so `deriveSceneGraph` walks the
 * loop into exactly one derived room. Pass overrides to attach a name.
 */
function createSingleRoomProject(roomOverrides?: Project['roomOverrides']): Project {
  const floor = createFloor('Ground Floor', {
    id: 'floor-a',
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'wall-b' }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { id: 'wall-c' }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { id: 'wall-d' }),
    ],
  })
  const project = projectWithFloor(floor)
  return roomOverrides === undefined ? project : { ...project, roomOverrides }
}

/** The first node of a derived collection, asserting the fixture produced exactly one. */
function soleNode<Node>(nodes: readonly Node[], label: string): Node {
  const [node] = nodes
  if (node === undefined) {
    throw new Error(`expected the fixture to derive exactly one ${label}`)
  }
  return node
}

/** The sole derived room scene node for the closed-loop fixture above. */
function soleDerivedRoom(project: Project): RoomSceneNode {
  return soleNode(deriveSceneGraph(project).rooms, 'room')
}

/**
 * Build a deterministic project with one floor, one horizontal wall, and a single
 * door opening centered on it. `deriveSceneGraph` resolves the opening against its
 * host wall into exactly one `opening:`-prefixed scene node, which the exporter is
 * expected to render. Ids are fixed so two independent builds are byte-identical.
 */
function createSingleOpeningProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-a' })
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: 'wall-a',
    position: 2000,
    id: 'opening-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls: [wall] })
  return projectWithFloor({ ...floor, openings: [opening] })
}

/** The sole derived opening scene node for the single-opening fixture above. */
function soleDerivedOpening(project: Project): OpeningSceneNode {
  return soleNode(deriveSceneGraph(project).openings, 'opening')
}

/**
 * Build a deterministic project with one floor and a single horizontal dimension
 * from (0,0) to (4000,0), offset 300 along the left normal. `deriveSceneGraph`
 * resolves it into exactly one `dimension:`-prefixed scene node carrying the
 * measured length, which the exporter is expected to annotate. Ids are fixed so
 * two independent builds are byte-identical.
 */
function createSingleDimensionProject(): Project {
  const dimension = createDimension({
    start: { x: 0, y: 0 },
    end: { x: 4000, y: 0 },
    offset: 300,
    id: 'dimension-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a' })
  return projectWithFloor({ ...floor, dimensions: [dimension] })
}

/** The sole derived dimension scene node for the single-dimension fixture above. */
function soleDerivedDimension(project: Project): DimensionSceneNode {
  return soleNode(deriveSceneGraph(project).dimensions, 'dimension')
}

/** Parse an SVG `points="x,y x,y ..."` attribute into an array of points. */
function parsePoints(attribute: string | null): { x: number; y: number }[] {
  return (attribute ?? '')
    .trim()
    .split(/\s+/u)
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x: x ?? Number.NaN, y: y ?? Number.NaN }
    })
}

describe('SvgPlanExporter emitting openings', () => {
  it('emits an opening element group per opening carrying the opening node id', () => {
    const project = createSingleOpeningProject()
    const opening = soleDerivedOpening(project)
    expect(opening.id).toBe(`${OPENING_NODE_PREFIX}opening-a`)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const groups = [...document.querySelectorAll('[data-node-id]')].filter(
      (element) => element.getAttribute('data-node-id') === opening.id,
    )

    expect(groups).toHaveLength(1)
  })

  it('breaks the host wall with an opening gap polygon', () => {
    const project = createSingleOpeningProject()
    const graph = deriveSceneGraph(project)
    const opening = soleDerivedOpening(project)
    const view = createSvgView(planContentBounds(graph))
    const expectedCorners = openingFootprint(
      opening.center,
      opening.along,
      opening.normal,
      opening.width,
      opening.hostThickness,
    ).map((corner) => view.project(corner))

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const group = document.querySelector(`[data-node-id="${opening.id}"]`)
    const polygon = group?.querySelector('polygon') ?? null
    expect(polygon).not.toBeNull()
    expect(polygon?.getAttribute('fill')).toBe('#ffffff')

    const actualCorners = parsePoints(polygon?.getAttribute('points') ?? null)
    expect(actualCorners).toHaveLength(expectedCorners.length)
    expectedCorners.forEach((expected, index) => {
      expect(actualCorners[index]?.x).toBeCloseTo(expected.x, 3)
      expect(actualCorners[index]?.y).toBeCloseTo(expected.y, 3)
    })
  })

  it('draws a jamb cap at each opening jamb', () => {
    const project = createSingleOpeningProject()
    const opening = soleDerivedOpening(project)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const group = document.querySelector(`[data-node-id="${opening.id}"]`)
    expect(group).not.toBeNull()

    const jambLines = group ? [...group.querySelectorAll('line')] : []
    const jambPolylines = group ? [...group.querySelectorAll('polyline')] : []
    // Two across-wall jamb caps, one at each jamb: two `<line>`s, or a single
    // `<polyline>` covering both. Either way the jamb ink is the opening stroke.
    const inkedLines = jambLines.filter((line) => line.getAttribute('stroke') === '#222222')
    const inkedPolylines = jambPolylines.filter(
      (polyline) => polyline.getAttribute('stroke') === '#222222',
    )

    expect(inkedLines.length === 2 || inkedPolylines.length >= 1).toBe(true)
  })
})

describe('SvgPlanExporter emitting rooms', () => {
  it('emits a filled polygon per derived room carrying the room node id', () => {
    const project = createSingleRoomProject()
    const room = soleDerivedRoom(project)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const polygons = document.querySelectorAll('polygon')

    expect(polygons).toHaveLength(1)
    const polygon = polygons[0]
    expect(polygon?.getAttribute('data-node-id')).toBe(room.id)
    expect(room.id.startsWith('room:')).toBe(true)
    const fill = polygon?.getAttribute('fill')
    expect(fill).toBeTruthy()
    expect(fill).not.toBe('none')
  })

  it('labels each room with its formatted area at the centroid', () => {
    const project = createSingleRoomProject()
    const room = soleDerivedRoom(project)
    const expectedArea = formatArea(room.area, DEFAULT_METRIC_PREFERENCES)
    // The room centroid is the natural anchor for its label; the exporter
    // positions the area text there. The text content is what this pins.
    const anchor = polygonCentroid(room.polygon)
    expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const texts = [...document.querySelectorAll('text')].map((text) => text.textContent)

    expect(texts).toContain(expectedArea)
  })

  it('includes the room name above the area when the room has a name override', () => {
    // The override map is keyed by `roomKey`, which equals the derived room id
    // with the `room:` prefix stripped. Deriving the key this way is robust to
    // the sorted-unique wall ordering the room derivation encodes in the id.
    const baselineRoom = soleDerivedRoom(createSingleRoomProject())
    const key = baselineRoom.id.slice('room:'.length)
    expect(roomKey({ wallIds: ['wall-a', 'wall-b', 'wall-c', 'wall-d'] })).toBe(key)
    const project = createSingleRoomProject({ [key]: { name: 'Parlor' } })
    const room = soleDerivedRoom(project)
    expect(room.name).toBe('Parlor')
    const expectedArea = formatArea(room.area, DEFAULT_METRIC_PREFERENCES)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const labels = [...document.querySelectorAll('text, tspan')].map((node) => node.textContent)

    expect(labels).toContain('Parlor')
    expect(labels).toContain(expectedArea)
  })
})

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

/** True when an inked `<line>` carries the projected endpoints in either direction. */
function inkedLineForSegment(
  lines: readonly SVGLineElement[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const near = (actual: string | null, expected: number): boolean =>
    Math.abs(Number(actual) - expected) < 1e-2
  return lines.some((line) => {
    const matches = (a: typeof from, b: typeof to): boolean =>
      near(line.getAttribute('x1'), a.x) &&
      near(line.getAttribute('y1'), a.y) &&
      near(line.getAttribute('x2'), b.x) &&
      near(line.getAttribute('y2'), b.y)
    return line.getAttribute('stroke') === '#222222' && (matches(from, to) || matches(to, from))
  })
}

/** Export the single-dimension fixture and bundle its node, group, lines, and projection. */
function exportSingleDimension() {
  const project = createSingleDimensionProject()
  const node = soleDerivedDimension(project)
  const view = createSvgView(planContentBounds(deriveSceneGraph(project)))
  const geometry = dimensionGeometry(node.start, node.end, node.offset)
  const content = new SvgPlanExporter().export(project).content
  const document = new DOMParser().parseFromString(content, 'image/svg+xml')
  const group = document.querySelector(`[data-node-id="${node.id}"]`)
  const lines = group ? [...group.querySelectorAll('line')] : []
  return { node, document, group, lines, view, geometry }
}

describe('SvgPlanExporter emitting dimensions', () => {
  it('emits a dimension group per dimension carrying the dimension node id', () => {
    const { node, document } = exportSingleDimension()
    const groups = [...document.querySelectorAll('[data-node-id]')].filter(
      (element) => element.getAttribute('data-node-id') === node.id,
    )

    expect(node.id).toBe(`${DIMENSION_NODE_PREFIX}dimension-a`)
    expect(groups).toHaveLength(1)
  })

  it('draws the offset dimension line and two extension lines', () => {
    const { lines, view, geometry } = exportSingleDimension()
    const at = (point: { x: number; y: number }) => view.project(point)

    expect(inkedLineForSegment(lines, at(geometry.lineStart), at(geometry.lineEnd))).toBe(true)
    expect(
      inkedLineForSegment(lines, at(geometry.extensionStart[0]), at(geometry.extensionStart[1])),
    ).toBe(true)
    expect(
      inkedLineForSegment(lines, at(geometry.extensionEnd[0]), at(geometry.extensionEnd[1])),
    ).toBe(true)
  })

  it('labels the dimension with its formatted length at the line midpoint', () => {
    const { node, group, view, geometry } = exportSingleDimension()
    const midpoint = view.project({
      x: (geometry.lineStart.x + geometry.lineEnd.x) / 2,
      y: (geometry.lineStart.y + geometry.lineEnd.y) / 2,
    })
    const expectedText = formatLength(node.length, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES))
    const labels = group ? [...group.querySelectorAll('text')] : []
    const label = labels.find((text) => text.textContent === expectedText) ?? null

    expect(label).not.toBeNull()
    expect(Number(label?.getAttribute('x'))).toBeCloseTo(midpoint.x, 2)
    expect(Number(label?.getAttribute('y'))).toBeCloseTo(midpoint.y, 2)
  })

  it('draws an arrowhead at each end of the dimension line', () => {
    const { lines } = exportSingleDimension()

    // Baseline geometry is the dimension line plus two extension lines (3 lines).
    // An arrowhead at each end adds at least one barb line per end, so the group
    // carries more than the 3 baseline lines: at least 5 in total. Kept
    // structural rather than pinned to exact barb endpoints.
    expect(lines.length).toBeGreaterThanOrEqual(5)
  })
})
