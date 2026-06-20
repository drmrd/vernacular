import { describe, it, expect } from 'vitest'
import { nudgeCandidate, CANDIDATE_STEP_MM } from './keyboard-candidate'

const origin = { x: 0, y: 0 }

describe('nudgeCandidate', () => {
  it('moves the candidate up one step for ArrowUp because y increases upward', () => {
    expect(nudgeCandidate(origin, 'ArrowUp', 100)).toEqual({ x: 0, y: 100 })
  })

  it('moves the candidate down one step for ArrowDown', () => {
    expect(nudgeCandidate(origin, 'ArrowDown', 100)).toEqual({ x: 0, y: -100 })
  })

  it('moves the candidate left one step for ArrowLeft', () => {
    expect(nudgeCandidate(origin, 'ArrowLeft', 100)).toEqual({ x: -100, y: 0 })
  })

  it('moves the candidate right one step for ArrowRight', () => {
    expect(nudgeCandidate(origin, 'ArrowRight', 100)).toEqual({ x: 100, y: 0 })
  })

  it('returns null for a non-arrow key so the hook can fall through', () => {
    expect(nudgeCandidate({ x: 5, y: 5 }, 'Enter', 100)).toBeNull()
  })
})

describe('CANDIDATE_STEP_MM', () => {
  it('steps by the same grid step the selection nudge uses', () => {
    expect(CANDIDATE_STEP_MM).toBe(100)
  })
})
