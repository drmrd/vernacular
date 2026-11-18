import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Floor, SceneGraph } from '../../core'
import {
  centeredEllFloor,
  flushEllFloor,
  longNorthWallFloor,
  nodesOf,
  offCenterPartitionFloor,
} from '../../core/scene/wall-runs-test-fixtures'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { findByEntityId } from '../testing'
import { buildScene } from './build-scene'
import { updateNearWallTransparency } from './near-wall-transparency'
import { enrollNearWallTargets } from './near-wall-transparency-enrollment'

const FADED_OPACITY = 0.1
const SPAN_KEY = 'wallSpanMm'
// The off-center partition floor is an 8000 x 4000 block of four exterior walls (south, east,
// north, west) cut by an interior partition at x = 3000. The partition meets the south and the
// north wall in a three-wall junction each, and each of those walls has an exterior run on an
// edge of its junction, so two junction fills are enrolled beside the four wall targets.
const EXTERIOR_WALL_COUNT = 4
const JUNCTION_FILL_COUNT = 2

interface Span {
  fromMm: number
  toMm: number
}

interface Piece {
  span: Span | undefined
  faded: boolean
}

const sceneGraphOf = (floor: Floor): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  ...nodesOf(floor),
  underlays: [],
  dimensions: [],
  stairs: [],
  furniture: [],
})

/** The scene of `floor` with the near-wall fade applied for a camera at `camera`. */
function fadedScene(floor: Floor, camera: { x: number; z: number }): THREE.Group {
  const graph = sceneGraphOf(floor)
  const root = buildScene(graph, new NeutralMaterialProvider())
  updateNearWallTransparency(enrollNearWallTargets(root, graph), camera)
  return root
}

/** True when some material of a mesh at or under `object` sits at the faded opacity. */
function isFaded(object: THREE.Object3D): boolean {
  let faded = false
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return
    const materials: THREE.Material[] = Array.isArray(part.material)
      ? part.material
      : [part.material]
    faded ||= materials.some((material) => material.opacity === FADED_OPACITY)
  })
  return faded
}

/** The meshes of the wall `entityId` with their recorded span and whether each is faded, by start. */
function piecesOf(root: THREE.Object3D, entityId: string): Piece[] {
  const pieces: Piece[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.entityId === entityId) {
      pieces.push({ span: object.userData[SPAN_KEY] as Span | undefined, faded: isFaded(object) })
    }
  })
  return pieces.sort((a, b) => (a.span?.fromMm ?? 0) - (b.span?.fromMm ?? 0))
}

function openingFaded(root: THREE.Object3D, openingId: string): boolean {
  const group = findByEntityId(root, openingId)
  expect(group).not.toBeNull()
  return isFaded(group as THREE.Object3D)
}

describe('the near-wall fade of a wall with several exterior runs', () => {
  it('fades only the run past an ell flush against the wall end, with the pieces on that run', () => {
    const root = fadedScene(flushEllFloor(), { x: 7000, z: 8000 })

    expect(piecesOf(root, 'wall:long-south')).toEqual([
      { span: { fromMm: 0, toMm: 4000 }, faded: false },
      { span: { fromMm: 4000, toMm: 10000 }, faded: true },
    ])
    expect(openingFaded(root, 'opening:inner-door')).toBe(false)
    expect(piecesOf(root, 'wall:ell-south').map((piece) => piece.faded)).toEqual([true])
  })

  it('fades the two runs on either side of a centered ell, and the window on the first', () => {
    const root = fadedScene(centeredEllFloor(), { x: 5000, z: 8000 })

    expect(piecesOf(root, 'wall:long-south')).toEqual([
      { span: { fromMm: 0, toMm: 3000 }, faded: true },
      { span: { fromMm: 3000, toMm: 7000 }, faded: false },
      { span: { fromMm: 7000, toMm: 10000 }, faded: true },
    ])
    expect(openingFaded(root, 'opening:side-window')).toBe(true)
  })

  it('fades only the run beside the room for a camera north of a wall that runs on past it', () => {
    const root = fadedScene(longNorthWallFloor(), { x: 2000, z: -8000 })

    expect(piecesOf(root, 'wall:long-north')).toEqual([
      { span: { fromMm: 0, toMm: 4000 }, faded: true },
      { span: { fromMm: 4000, toMm: 10000 }, faded: false },
    ])
    expect(openingFaded(root, 'opening:front-door')).toBe(true)
    expect(openingFaded(root, 'opening:far-window')).toBe(false)
  })
})

describe('the near-wall targets of a block cut by an off-center partition', () => {
  it('number one per exterior wall plus one per junction fill beside an exterior wall', () => {
    const graph = sceneGraphOf(offCenterPartitionFloor())
    const root = buildScene(graph, new NeutralMaterialProvider())

    expect(enrollNearWallTargets(root, graph)).toHaveLength(
      EXTERIOR_WALL_COUNT + JUNCTION_FILL_COUNT,
    )
  })
})
