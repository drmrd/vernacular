import { describe, it, expect } from 'vitest'
import { TRANSLATE_ENTITIES } from '../../core'
import type { PreviewSegment } from './draw-plan'
import { beginMoveDrag, endMoveDrag, IDLE_MOVE_DRAG, moveDragGhost } from './move-drag'

const ORIGIN = { x: 100, y: 100 }
const SEGMENTS: readonly PreviewSegment[] = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }]
const FLOOR_ID = 'floor-1'
const ENTITY_IDS = ['w1']

describe('beginMoveDrag', () => {
  it('enters the dragging phase carrying the grab origin and the ghost segments', () => {
    const state = beginMoveDrag(ORIGIN, SEGMENTS)

    expect(state).toEqual({ phase: 'dragging', origin: ORIGIN, segments: SEGMENTS })
  })
})

describe('moveDragGhost', () => {
  it('translates each ghost endpoint by the pointer offset while dragging', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)

    expect(moveDragGhost(dragging, { x: 130, y: 100 })).toEqual([
      { start: { x: 30, y: 0 }, end: { x: 230, y: 0 } },
    ])
  })

  it('shows no ghost while idle', () => {
    expect(moveDragGhost(IDLE_MOVE_DRAG, { x: 130, y: 100 })).toEqual([])
  })
})

describe('endMoveDrag', () => {
  it('returns to idle and emits a translate command for the pointer delta', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)

    const result = endMoveDrag(dragging, { x: 130, y: 100 }, FLOOR_ID, ENTITY_IDS)

    expect(result.state.phase).toBe('idle')
    expect(result.command?.type).toBe(TRANSLATE_ENTITIES)
    expect(result.command?.params).toEqual({
      floorId: 'floor-1',
      entityIds: ['w1'],
      delta: { x: 30, y: 0 },
    })
  })

  it('returns to idle without a command when the drag has zero delta', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)

    const result = endMoveDrag(dragging, ORIGIN, FLOOR_ID, ENTITY_IDS)

    expect(result.state.phase).toBe('idle')
    expect(result.command).toBeUndefined()
  })
})
