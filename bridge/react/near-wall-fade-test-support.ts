import type { SceneGraph } from '../../core'

export const SQUARE_ROOM_SPAN_MM = 4000
const WALL_THICKNESS_MM = 200
export const SQUARE_ROOM_CEILING_MM = 2400

type Point = { x: number; y: number }

const corners = (): Point[] => [
  { x: 0, y: 0 },
  { x: SQUARE_ROOM_SPAN_MM, y: 0 },
  { x: SQUARE_ROOM_SPAN_MM, y: SQUARE_ROOM_SPAN_MM },
  { x: 0, y: SQUARE_ROOM_SPAN_MM },
]

// The id order follows the corner order, so wall:s runs along plan y = 0 and each wall ends
// where the next begins.
function perimeterWalls(ceiling: number): SceneGraph['walls'] {
  const around = corners()
  return ['wall:s', 'wall:e', 'wall:n', 'wall:w'].map((id, index) => ({
    id,
    kind: 'wall',
    floorId: 'g',
    start: { ...around[index]! },
    end: { ...around[(index + 1) % around.length]! },
    thickness: WALL_THICKNESS_MM,
    height: ceiling,
  }))
}

const southWindow = (): SceneGraph['openings'][number] => ({
  id: 'opening:window',
  kind: 'opening',
  floorId: 'g',
  type: 'double-hung-window',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 1200,
  sillHeight: 900,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 's',
})

// A square room whose four walls are all exterior, with a double-hung window in the south
// wall. The wall scene-node ids carry the `wall:` prefix while the window's hostWallId is
// the raw id, the convention a derived graph produces.
export function squareRoomWithSouthWindow(ceiling: number = SQUARE_ROOM_CEILING_MM): SceneGraph {
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: perimeterWalls(ceiling),
    rooms: [
      {
        id: 'room:r',
        kind: 'room',
        floorId: 'g',
        polygon: corners(),
        clearPolygon: corners(),
        area: SQUARE_ROOM_SPAN_MM * SQUARE_ROOM_SPAN_MM,
        ceilingHeight: ceiling,
      },
    ],
    underlays: [],
    openings: [southWindow()],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Reads the opacity of the 'glass' material under a built opening group, structurally so
// the bridge tests do not import three.
export function glassOpacityOf(group: unknown): number | undefined {
  let opacity: number | undefined
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { name?: string; opacity?: number } }
    if (
      mesh.material !== undefined &&
      !Array.isArray(mesh.material) &&
      mesh.material.name === 'glass'
    ) {
      opacity = mesh.material.opacity
    }
  })
  return opacity
}

// The distinct material opacities under a built group, structurally so the bridge tests
// do not import three. Covers single- and multi-material meshes.
export function opacitiesOf(group: unknown): number[] {
  const opacities = new Set<number>()
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { opacity?: number } | { opacity?: number }[] }
    if (mesh.material === undefined) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (typeof material.opacity === 'number') opacities.add(material.opacity)
    }
  })
  return [...opacities]
}
