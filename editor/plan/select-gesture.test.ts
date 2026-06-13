import { describe, expect, it } from 'vitest'

import { advanceSelectGesture, beginSelectGesture, endSelectGesture } from './select-gesture'

describe('beginSelectGesture', () => {
  it('opens a pending gesture anchored at the press point', () => {
    expect(beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({
      mode: 'pending',
      originWorld: { x: 0, y: 0 },
      lastCanvas: { x: 10, y: 10 },
    })
  })
})

describe('advanceSelectGesture', () => {
  it('stays pending and emits nothing for a sub-threshold move', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })

    const result = advanceSelectGesture(begin, {
      world: { x: 10, y: 10 },
      canvas: { x: 20, y: 20 },
      shift: false,
    })

    expect(result.state.mode).toBe('pending')
    expect(result.state.lastCanvas).toEqual({ x: 10, y: 10 })
    expect(result.panDelta).toBeUndefined()
    expect(result.marquee).toBeUndefined()
  })

  it('stays pending one millimeter short of the threshold', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })

    const result = advanceSelectGesture(begin, {
      world: { x: 49, y: 0 },
      canvas: { x: 30, y: 10 },
      shift: false,
    })

    expect(result.state.mode).toBe('pending')
    expect(result.panDelta).toBeUndefined()
  })

  it('locks exactly at the threshold (the cutover is inclusive)', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })

    const result = advanceSelectGesture(begin, {
      world: { x: 50, y: 0 },
      canvas: { x: 30, y: 10 },
      shift: false,
    })

    expect(result.state.mode).toBe('panning')
    expect(result.panDelta).toEqual({ x: 20, y: 0 })
  })

  it('starts a pan when the threshold is crossed without Shift', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })

    const result = advanceSelectGesture(begin, {
      world: { x: 100, y: 0 },
      canvas: { x: 50, y: 10 },
      shift: false,
    })

    expect(result.state.mode).toBe('panning')
    expect(result.state.lastCanvas).toEqual({ x: 50, y: 10 })
    expect(result.panDelta).toEqual({ x: 40, y: 0 })
    expect(result.marquee).toBeUndefined()
  })

  it('emits the incremental canvas delta on a later pan move', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })
    const panning = advanceSelectGesture(begin, {
      world: { x: 100, y: 0 },
      canvas: { x: 50, y: 10 },
      shift: false,
    }).state

    const result = advanceSelectGesture(panning, {
      world: { x: 120, y: 0 },
      canvas: { x: 70, y: 10 },
      shift: false,
    })

    expect(result.state.mode).toBe('panning')
    expect(result.state.lastCanvas).toEqual({ x: 70, y: 10 })
    expect(result.panDelta).toEqual({ x: 20, y: 0 })
  })

  it('starts a marquee when the threshold is crossed with Shift', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })

    const result = advanceSelectGesture(begin, {
      world: { x: 100, y: 0 },
      canvas: { x: 50, y: 10 },
      shift: true,
    })

    expect(result.state.mode).toBe('marquee')
    expect(result.marquee).toEqual({ min: { x: 0, y: 0 }, max: { x: 100, y: 0 } })
    expect(result.panDelta).toBeUndefined()
  })

  it('keeps panning when a later sample holds Shift (mode locked at first crossing)', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })
    const panning = advanceSelectGesture(begin, {
      world: { x: 100, y: 0 },
      canvas: { x: 50, y: 10 },
      shift: false,
    }).state

    const result = advanceSelectGesture(panning, {
      world: { x: 200, y: 0 },
      canvas: { x: 90, y: 10 },
      shift: true,
    })

    expect(result.state.mode).toBe('panning')
    expect(result.panDelta).toEqual({ x: 40, y: 0 })
    expect(result.marquee).toBeUndefined()
  })

  it('keeps marquee when a later sample drops Shift (mode locked at first crossing)', () => {
    const begin = beginSelectGesture({ x: 0, y: 0 }, { x: 10, y: 10 })
    const marquee = advanceSelectGesture(begin, {
      world: { x: 100, y: 0 },
      canvas: { x: 50, y: 10 },
      shift: true,
    }).state

    const result = advanceSelectGesture(marquee, {
      world: { x: 150, y: 20 },
      canvas: { x: 80, y: 30 },
      shift: false,
    })

    expect(result.state.mode).toBe('marquee')
    expect(result.marquee).toEqual({ min: { x: 0, y: 0 }, max: { x: 150, y: 20 } })
    expect(result.panDelta).toBeUndefined()
  })
})

describe('endSelectGesture', () => {
  it('ends a panning gesture with no selection effect', () => {
    expect(
      endSelectGesture(
        { mode: 'panning', originWorld: { x: 0, y: 0 }, lastCanvas: { x: 70, y: 10 } },
        { world: { x: 120, y: 0 }, shift: false },
      ),
    ).toEqual({ kind: 'none' })
  })

  it('ends a marquee gesture with the resolved rectangle', () => {
    expect(
      endSelectGesture(
        { mode: 'marquee', originWorld: { x: 0, y: 0 }, lastCanvas: { x: 50, y: 10 } },
        { world: { x: 100, y: 40 }, shift: false },
      ),
    ).toEqual({ kind: 'marquee', rect: { min: { x: 0, y: 0 }, max: { x: 100, y: 40 } } })
  })

  it('ends a pending gesture with a click at the press origin', () => {
    expect(
      endSelectGesture(
        { mode: 'pending', originWorld: { x: 5, y: 7 }, lastCanvas: { x: 5, y: 7 } },
        { world: { x: 6, y: 8 }, shift: true },
      ),
    ).toEqual({ kind: 'click', world: { x: 5, y: 7 }, shift: true })
  })
})
