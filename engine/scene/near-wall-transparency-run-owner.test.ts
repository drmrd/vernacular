import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { exteriorWalls, type ExteriorWall } from '../../core'
import { centeredEllFloor, flushEllFloor } from '../../core/scene/wall-runs-test-fixtures'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildScene } from './build-scene'
import { prepareNearWallTransparency, type NearWallTarget } from './near-wall-transparency'
import { enrollNearWallTargets } from './near-wall-transparency-enrollment'
import { fadedScene, piecesOf, sceneGraphOf } from './near-wall-transparency-test-support'
import { WALL_SPAN_KEY } from './wall-span'

const LONG_SOUTH = 'wall:long-south'
// Plan y maps to world -z, so a camera at positive z stands south of the house, on the outside
// of the long south wall.
const SOUTH_OF_FLUSH_ELL = { x: 7000, z: 8000 }

const BOUNDARY_MM = 4000
const WALL_END_MM = 8000
// The boundary mesh spans half a millimeter to each side of the boundary, so its middle is on it.
const SLACK_MM = 0.5

const FIRST_RUN_INDEX = 0

const materialsOf = (mesh: THREE.Mesh): THREE.Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material]

/** The positions in `targets` of the targets that hold a material of `mesh`. */
const holdingTargetIndexes = (targets: NearWallTarget[], mesh: THREE.Mesh): number[] =>
  targets.flatMap((target, index) =>
    target.materials.some((record) => materialsOf(mesh).includes(record.material)) ? [index] : [],
  )

const meshesOfWall = (root: THREE.Object3D, entityId: string): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.entityId === entityId) meshes.push(object)
  })
  return meshes
}

/** The centered ell floor built with the long south wall's meshes stripped of their spans. */
function centeredEllWithoutSpans() {
  const graph = sceneGraphOf(centeredEllFloor())
  const root = buildScene(graph, new NeutralMaterialProvider())
  for (const mesh of meshesOfWall(root, LONG_SOUTH)) delete mesh.userData[WALL_SPAN_KEY]
  return { graph, root, targets: enrollNearWallTargets(root, graph) }
}

const plainWallMesh = (fromMm: number, toMm: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  mesh.userData.entityId = 'wall:w'
  mesh.userData[WALL_SPAN_KEY] = { fromMm, toMm }
  return mesh
}

const runOfWallW = (fromMm: number, toMm: number, normalY: number): ExteriorWall => ({
  wallId: 'wall:w',
  fromMm,
  toMm,
  outwardNormal: { x: 0, y: normalY },
  openingIds: [],
})

describe('the owner run of a wall mesh in the near-wall fade', () => {
  it('gives a wall mesh with no recorded span to the first run of its wall', () => {
    const { graph, root, targets } = centeredEllWithoutSpans()
    const exterior = exteriorWalls(graph.walls, graph.rooms, graph.openings)
    // The first run of the long south wall in the exterior order is the one from 0 to 3000.
    const firstRunIndex = exterior.findIndex((run) => run.wallId === LONG_SOUTH)
    const meshes = meshesOfWall(root, LONG_SOUTH)

    expect(firstRunIndex).toBeGreaterThanOrEqual(0)
    expect(meshes.length).toBeGreaterThan(0)
    for (const mesh of meshes) expect(holdingTargetIndexes(targets, mesh)).toEqual([firstRunIndex])
  })

  it('gives a wall mesh whose middle lies on the boundary of two runs to the first run', () => {
    const first = plainWallMesh(0, BOUNDARY_MM - SLACK_MM)
    const boundary = plainWallMesh(BOUNDARY_MM - SLACK_MM, BOUNDARY_MM + SLACK_MM)
    const last = plainWallMesh(BOUNDARY_MM + SLACK_MM, WALL_END_MM)
    const root = new THREE.Group().add(first, boundary, last)

    const targets = prepareNearWallTransparency(root, [
      runOfWallW(0, BOUNDARY_MM, -1),
      runOfWallW(BOUNDARY_MM, WALL_END_MM, 1),
    ])

    expect(holdingTargetIndexes(targets, first)).toEqual([FIRST_RUN_INDEX])
    expect(holdingTargetIndexes(targets, boundary)).toEqual([FIRST_RUN_INDEX])
  })

  it('gives a mesh whose middle lies in no run to no target, and one within the tolerance to the run', () => {
    const inGap = plainWallMesh(3500, 4500)
    const atToleranceEdge = plainWallMesh(3000.5, 3001.5)
    const root = new THREE.Group().add(inGap, atToleranceEdge)

    const targets = prepareNearWallTransparency(root, [
      runOfWallW(0, 3000, -1),
      runOfWallW(5000, WALL_END_MM, 1),
    ])

    expect(holdingTargetIndexes(targets, inGap)).toEqual([])
    expect(holdingTargetIndexes(targets, atToleranceEdge)).toEqual([FIRST_RUN_INDEX])
  })

  it('still fades only the run past a flush ell, with recorded spans in place', () => {
    const root = fadedScene(flushEllFloor(), SOUTH_OF_FLUSH_ELL)

    // The stretch 0 to 4000 stands against the ell, so only the 4000 to 10000 stretch fades.
    expect(piecesOf(root, LONG_SOUTH).map((piece) => piece.faded)).toEqual([false, true])
  })
})
