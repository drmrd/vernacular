import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import {
  ORIGIN,
  addWallOnGround,
  mountHookAfterRefusal,
  mountWithStandingRefusal,
  sessionWithOneFloor,
} from './opening-tool-context-test-support'

afterEach(cleanup)

describe('a standing refusal when the plan changes', () => {
  it('retires after an edit is dispatched', () => {
    const session = sessionWithOneFloor()
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    addWallOnGround(session)
    planChanged()

    expect(refusal()).toBeNull()
  })

  it('retires after an undo', () => {
    const session = sessionWithOneFloor()
    addWallOnGround(session)
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    session.undo()
    planChanged()

    expect(refusal()).toBeNull()
  })

  it('retires after a redo', () => {
    const session = sessionWithOneFloor()
    addWallOnGround(session)
    session.undo()
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    session.redo()
    planChanged()

    expect(refusal()).toBeNull()
  })
})

describe('a standing refusal when the situation stays the same', () => {
  it('stays when the hook renders again with the same basis references', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis() })

    expect(refusal()).toBe('opening-overlap')
  })
})

describe('a standing refusal when one input of the situation changes', () => {
  it('retires when only the active floor changes', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(
      sessionWithOneFloor(),
      'no-floor-above',
    )
    expect(refusal()).toBe('no-floor-above')

    rerenderWith({ ...basis(), activeFloorId: 'upper-floor' })

    expect(refusal()).toBeNull()
  })

  it('retires when only the selection changes to a new set', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())
    const otherSelection = new Set<string>()
    expect(otherSelection).not.toBe(basis().selectedIds)

    rerenderWith({ ...basis(), selectedIds: otherSelection })

    expect(refusal()).toBeNull()
  })

  it('retires when only the tool changes', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), tool: 'place-stair' })

    expect(refusal()).toBeNull()
  })

  it('retires when only the placement type changes', () => {
    const { refusal, choosePlacementType } = mountWithStandingRefusal(sessionWithOneFloor())

    choosePlacementType('double-swing-door')

    expect(refusal()).toBeNull()
  })
})

describe('a standing refusal when the keyboard candidate is replaced', () => {
  it('stays when the new candidate has the same x and y', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())
    const sameSpot = { x: ORIGIN.x, y: ORIGIN.y }
    expect(sameSpot).not.toBe(basis().candidate)

    rerenderWith({ ...basis(), candidate: sameSpot })

    expect(refusal()).toBe('opening-overlap')
  })

  it('retires when the candidate has a different x', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), candidate: { x: ORIGIN.x + 1, y: ORIGIN.y } })

    expect(refusal()).toBeNull()
  })

  it('retires when the candidate has a different y', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), candidate: { x: ORIGIN.x, y: ORIGIN.y + 1 } })

    expect(refusal()).toBeNull()
  })
})

describe('the count of refused attempts', () => {
  it('rises by one for each reason reported, a repeat of the standing reason included', () => {
    const { result } = renderHook(() => useOpeningTool(), { wrapper: OpeningToolProvider })
    expect(result.current.refusalAttempt).toBe(0)

    act(() => result.current.setPlacementRefusal('opening-overlap'))
    expect(result.current.refusalAttempt).toBe(1)

    act(() => result.current.setPlacementRefusal('opening-overlap'))
    expect(result.current.refusalAttempt).toBe(2)
  })

  it('does not rise when the refusal is cleared with null', () => {
    const { result } = renderHook(() => useOpeningTool(), { wrapper: OpeningToolProvider })
    act(() => result.current.setPlacementRefusal('no-host-wall'))
    expect(result.current.refusalAttempt).toBe(1)

    act(() => result.current.setPlacementRefusal(null))

    expect(result.current.refusalAttempt).toBe(1)
  })
})

describe('a refusal reported in the same commit as a change of the basis', () => {
  it('stands after that commit and retires at the next change of the basis', () => {
    const session = sessionWithOneFloor()
    const { refusal, basis, reportWithBasisChange, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    reportWithBasisChange({ ...basis(), selectedIds: new Set<string>() }, 'no-host-wall')
    expect(refusal()).toBe('no-host-wall')

    addWallOnGround(session)
    planChanged()
    expect(refusal()).toBeNull()
  })

  it('stands when the report repeats the standing reason, then retires at the next change', () => {
    const { refusal, basis, reportWithBasisChange, rerenderWith } = mountWithStandingRefusal(
      sessionWithOneFloor(),
      'opening-overlap',
    )

    reportWithBasisChange({ ...basis(), selectedIds: new Set<string>() }, 'opening-overlap')
    expect(refusal()).toBe('opening-overlap')

    rerenderWith({ ...basis(), selectedIds: new Set<string>() })
    expect(refusal()).toBeNull()
  })

  it('retires when the basis changes in a later commit than the report', () => {
    const { refusal, basis, report, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    report('no-host-wall')
    expect(refusal()).toBe('no-host-wall')
    rerenderWith({ ...basis(), selectedIds: new Set<string>() })

    expect(refusal()).toBeNull()
  })
})

describe('a refusal reported before the hook mounted', () => {
  it('is cleared when the hook mounts', () => {
    const { refusal, mountHook } = mountHookAfterRefusal(sessionWithOneFloor(), 'no-host-wall')

    mountHook()

    expect(refusal()).toBeNull()
  })
})

describe('a refusal of one placement tool when the tool changes', () => {
  it('does not show under another placement tool', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(
      sessionWithOneFloor(),
      'no-host-wall',
    )

    rerenderWith({ ...basis(), tool: 'place-stair' })

    expect(refusal()).toBeNull()
  })

  it('does not come back when the first tool is taken up again', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(
      sessionWithOneFloor(),
      'no-host-wall',
    )

    rerenderWith({ ...basis(), tool: 'select' })
    rerenderWith({ ...basis(), tool: 'place-opening' })

    expect(refusal()).toBeNull()
  })
})
