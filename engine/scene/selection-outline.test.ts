import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { createSelectionOutlineGroup, reconcileSelectionOutline } from './selection-outline'
import type { SceneGraph } from '../../core'

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    },
  ],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

function lineCount(group: THREE.Group): number {
  return group.children.filter((child) => child instanceof THREE.LineSegments).length
}

describe('reconcileSelectionOutline', () => {
  it('adds outline line segments for a selected entity', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const group = createSelectionOutlineGroup()

    reconcileSelectionOutline(root, new Set(['wall:w1']), group)

    expect(lineCount(group)).toBeGreaterThan(0)
  })

  it('clears the outline when nothing is selected', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const group = createSelectionOutlineGroup()

    reconcileSelectionOutline(root, new Set(['wall:w1']), group)
    reconcileSelectionOutline(root, new Set(), group)

    expect(lineCount(group)).toBe(0)
  })
})
