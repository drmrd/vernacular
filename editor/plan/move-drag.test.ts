import { describe, it, expect } from 'vitest'
import { DEFAULT_METRIC_PREFERENCES, TRANSLATE_ENTITIES } from '../../core'
import type { Point } from '../../core'
import type { PreviewSegment } from './draw-plan'
import { dragReadout } from './drag-readout'
import {
  beginMoveDrag,
  endMoveDrag,
  IDLE_MOVE_DRAG,
  moveDragGhost,
  moveDragReadout,
} from './move-drag'

const ORIGIN = { x: 100, y: 100 }
const SEGMENTS: readonly PreviewSegment[] = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }]
const FLOOR_ID = 'floor-1'
const ENTITY_IDS = ['w1']

const snapToFifties = (point: Point): Point => ({
  x: Math.round(point.x / 50) * 50,
  y: Math.round(point.y / 50) * 50,
})

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

  it('snaps the representative anchor and rigidly moves the whole group by that delta', () => {
    const twoSegments: readonly PreviewSegment[] = [
      { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { start: { x: 0, y: 300 }, end: { x: 0, y: 500 } },
    ]
    const dragging = beginMoveDrag(ORIGIN, twoSegments)

    // Raw delta {30,0} → proposed anchor {30,0} snaps to {50,0} → effective delta {50,0}.
    expect(moveDragGhost(dragging, { x: 130, y: 100 }, snapToFifties)).toEqual([
      { start: { x: 50, y: 0 }, end: { x: 250, y: 0 } },
      { start: { x: 50, y: 300 }, end: { x: 50, y: 500 } },
    ])
  })
})

describe('moveDragReadout', () => {
  it('shows no readout while idle', () => {
    expect(
      moveDragReadout(IDLE_MOVE_DRAG, { x: 130, y: 100 }, DEFAULT_METRIC_PREFERENCES),
    ).toBeUndefined()
  })

  it('reads the grab origin to the live pointer while dragging', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)
    const pointer = { x: 130, y: 220 }

    expect(moveDragReadout(dragging, pointer, DEFAULT_METRIC_PREFERENCES)).toEqual(
      dragReadout(ORIGIN, pointer, DEFAULT_METRIC_PREFERENCES),
    )
  })
})

describe('endMoveDrag', () => {
  it('returns to idle and emits a translate command for the pointer delta', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)

    const result = endMoveDrag(
      dragging,
      { x: 130, y: 100 },
      {
        floorId: FLOOR_ID,
        entityIds: ENTITY_IDS,
      },
    )

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

    const result = endMoveDrag(dragging, ORIGIN, { floorId: FLOOR_ID, entityIds: ENTITY_IDS })

    expect(result.state.phase).toBe('idle')
    expect(result.command).toBeUndefined()
  })

  it('commits the snapped delta rather than the raw pointer delta', () => {
    const dragging = beginMoveDrag(ORIGIN, SEGMENTS)

    // Raw delta {30,0} → proposed anchor {30,0} snaps to {50,0} → effective delta {50,0}.
    const result = endMoveDrag(
      dragging,
      { x: 130, y: 100 },
      {
        floorId: FLOOR_ID,
        entityIds: ENTITY_IDS,
        snap: snapToFifties,
      },
    )

    expect(result.command?.type).toBe(TRANSLATE_ENTITIES)
    expect(result.command?.params).toEqual({
      floorId: 'floor-1',
      entityIds: ['w1'],
      delta: { x: 50, y: 0 },
    })
  })
})
