// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRIC_PREFERENCES,
  OPENING_NODE_PREFIX,
  deriveSceneGraph,
  formatArea,
  openingFootprint,
  polygonCentroid,
  roomKey,
} from '../../'
import { createEmptyProject, createFloor, createOpening, createWall } from '../../model/factories'
import type { Project } from '../../model/types'
import type { OpeningSceneNode, RoomSceneNode } from '../../scene/scene-graph'
import { createSvgView, planContentBounds } from './svg-view'
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
  const project: Project = {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [floor],
  }
  return roomOverrides === undefined ? project : { ...project, roomOverrides }
}

/** The sole derived room scene node for the closed-loop fixture above. */
function soleDerivedRoom(project: Project): RoomSceneNode {
  const [room] = deriveSceneGraph(project).rooms
  if (room === undefined) {
    throw new Error('expected the closed wall loop to derive exactly one room')
  }
  return room
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
  return {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [{ ...floor, openings: [opening] }],
  }
}

/** The sole derived opening scene node for the single-opening fixture above. */
function soleDerivedOpening(project: Project): OpeningSceneNode {
  const [opening] = deriveSceneGraph(project).openings
  if (opening === undefined) {
    throw new Error('expected the door fixture to derive exactly one opening')
  }
  return opening
}

/** Parse an SVG `points="x,y x,y ..."` attribute into an array of points. */
function parsePoints(attribute: string | null): { x: number; y: number }[] {
  if (attribute === null) {
    return []
  }
  return attribute
    .trim()
    .split(/\s+/u)
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
