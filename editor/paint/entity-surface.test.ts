import { describe, it, expect } from 'vitest'
import { WALL_NODE_PREFIX } from '../../core'
import { wallFaceForSelection } from './entity-surface'

const wallNodeId = (id: string): string => `${WALL_NODE_PREFIX}${id}`

describe('wallFaceForSelection', () => {
  it('returns the first face of the one selected wall', () => {
    const ref = wallFaceForSelection(new Set([wallNodeId('abc')]))
    expect(ref).toEqual({ kind: 'wall-face', wallId: 'abc', side: 'left' })
  })

  it('returns null when nothing is selected', () => {
    expect(wallFaceForSelection(new Set())).toBeNull()
  })

  it('returns null when several entities are selected', () => {
    expect(wallFaceForSelection(new Set([wallNodeId('a'), wallNodeId('b')]))).toBeNull()
  })

  it('returns null when the one selected entity is not a wall', () => {
    expect(wallFaceForSelection(new Set(['room:xyz']))).toBeNull()
  })
})
