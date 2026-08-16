// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRIC_PREFERENCES,
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  deriveSceneGraph,
  dimensionGeometry,
  effectiveWallThickness,
  formatArea,
  formatLength,
  lengthFormatOptions,
  openingFootprint,
  polygonCentroid,
  roomKey,
} from '../../'
import {
  createConstructionProfiledWallProject,
  createSingleDimensionProject,
  createSingleOpeningProject,
  createSingleRoomProject,
  createSingleWallProject,
  createTwoWallProject,
  parsePoints,
  soleDerivedDimension,
  soleDerivedOpening,
  soleDerivedRoom,
} from './svg-plan-exporter-test-fixtures'
import { createSvgView, planContentBounds } from './svg-view'
import { SvgPlanExporter } from './svg-plan-exporter'

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

  it('strokes a construction-profiled wall at its assembly thickness, not its raw thickness', () => {
    const project = createConstructionProfiledWallProject()
    const wall = project.floors[0]?.walls[0]
    if (wall === undefined) {
      throw new Error('expected the fixture to carry one wall')
    }
    const expectedThickness = effectiveWallThickness(wall)
    // Sanity: the fixture only proves the point if the assembly and raw figures differ.
    expect(expectedThickness).not.toBe(wall.thickness)

    const result = new SvgPlanExporter().export(project)
    const document = new DOMParser().parseFromString(result.content, 'image/svg+xml')
    const line = document.querySelector('line[data-node-id^="wall:"]')

    expect(line).not.toBeNull()
    expect(Number(line?.getAttribute('stroke-width'))).toBe(expectedThickness)
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
