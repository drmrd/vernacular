import type {
  OpeningInteractionState,
  OpeningPartId,
  OpeningSceneNode,
  SceneGraph,
} from '../../core'
import { buildScene, NeutralMaterialProvider, type SceneRoot } from '../../engine'

import { openPartsWith } from '../open-parts-test-support'

export type HungWindowType = 'double-hung-window' | 'single-hung-window'

// A whole-second tick covers the full travel in one step.
export const FULL_STEP = 1

// A hung window on a wall that runs along world X at world Z = -2000 (plan y maps to world -z).
// Its frame spans world y 900 to 2100.
export function hungWindowNode(type: HungWindowType): OpeningSceneNode {
  return {
    id: 'opening:hung-window',
    kind: 'opening',
    floorId: 'g',
    type,
    center: { x: 1000, y: 2000 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 1200,
    sillHeight: 900,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

export function graphWithOpening(node: OpeningSceneNode): SceneGraph {
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: [],
    rooms: [],
    underlays: [],
    openings: [node],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

export function sceneWithOpening(node: OpeningSceneNode): SceneRoot {
  return buildScene(graphWithOpening(node), new NeutralMaterialProvider())
}

// An interaction state that holds the named parts of one opening open.
export function holdingOpen(
  openingId: string,
  parts: readonly OpeningPartId[],
): OpeningInteractionState {
  return { openParts: openPartsWith({ [openingId]: parts }) }
}
