import { describe, it, expect } from 'vitest'
import { MOVE_UNDERLAY } from '../../core'
import {
  beginUnderlayMoveDrag,
  endUnderlayMoveDrag,
  IDLE_UNDERLAY_MOVE_DRAG,
} from './underlay-move-drag'

const ORIGIN = { x: 100, y: 100 }
const UNDERLAY_ID = 'u1'
const FLOOR_ID = 'floor-1'

describe('beginUnderlayMoveDrag', () => {
  it('enters the dragging phase carrying the grab origin and the underlay id', () => {
    const state = beginUnderlayMoveDrag(ORIGIN, UNDERLAY_ID)

    expect(state).toEqual({ phase: 'dragging', origin: ORIGIN, underlayId: UNDERLAY_ID })
  })
})

describe('endUnderlayMoveDrag', () => {
  it('returns to idle and emits a move command for the pointer delta', () => {
    const dragging = beginUnderlayMoveDrag(ORIGIN, UNDERLAY_ID)

    const result = endUnderlayMoveDrag(dragging, { x: 130, y: 70 }, FLOOR_ID)

    expect(result.state.phase).toBe('idle')
    expect(result.command?.type).toBe(MOVE_UNDERLAY)
    expect(result.command?.params).toEqual({
      floorId: 'floor-1',
      underlayId: 'u1',
      delta: { x: 30, y: -30 },
    })
  })

  it('returns to idle without a command when the drag has zero delta', () => {
    const dragging = beginUnderlayMoveDrag(ORIGIN, UNDERLAY_ID)

    const result = endUnderlayMoveDrag(dragging, ORIGIN, FLOOR_ID)

    expect(result.state.phase).toBe('idle')
    expect(result.command).toBeUndefined()
  })

  it('stays idle and emits no command when not dragging', () => {
    const result = endUnderlayMoveDrag(IDLE_UNDERLAY_MOVE_DRAG, { x: 130, y: 70 }, FLOOR_ID)

    expect(result.state).toBe(IDLE_UNDERLAY_MOVE_DRAG)
    expect(result.command).toBeUndefined()
  })
})
