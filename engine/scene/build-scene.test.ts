import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import type { SceneGraph } from '../../core'

describe('buildScene', () => {
  it('creates one group per scene node carrying its id and elevation', () => {
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:a', kind: 'floor', name: 'Ground', elevation: 0 },
        { id: 'floor:b', kind: 'floor', name: 'Upper', elevation: 2700 },
      ],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
    }

    const root = buildScene(graph)

    expect(root.children).toHaveLength(2)
    const [first, second] = root.children
    expect(first?.name).toBe('floor:a')
    expect(first?.userData.entityId).toBe('floor:a')
    expect(first?.position.y).toBe(0)
    expect(second?.userData.entityId).toBe('floor:b')
    expect(second?.position.y).toBe(2700)
  })
})
