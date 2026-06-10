import { describe, expect, it } from 'vitest'
import { nextFocusIndex } from './overlay-keyboard'

describe('nextFocusIndex', () => {
  it('moves focus to the next entity on ArrowDown', () => {
    expect(nextFocusIndex(0, 'ArrowDown', 3)).toBe(1)
  })

  it('moves focus to the next entity on ArrowRight', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 3)).toBe(1)
  })

  it('clamps at the last entity without wrapping past the end', () => {
    expect(nextFocusIndex(2, 'ArrowDown', 3)).toBe(2)
  })

  it('clamps at the first entity without wrapping before the start', () => {
    expect(nextFocusIndex(0, 'ArrowUp', 3)).toBe(0)
  })

  it('moves focus to the previous entity on ArrowLeft like ArrowUp', () => {
    expect(nextFocusIndex(2, 'ArrowLeft', 3)).toBe(1)
  })

  it('jumps to the first entity on Home', () => {
    expect(nextFocusIndex(1, 'Home', 3)).toBe(0)
  })

  it('jumps to the last entity on End', () => {
    expect(nextFocusIndex(1, 'End', 3)).toBe(2)
  })

  it('leaves focus unchanged for an unrelated key', () => {
    expect(nextFocusIndex(1, 'Tab', 3)).toBe(1)
  })

  it('leaves focus unchanged when there are no entities', () => {
    expect(nextFocusIndex(0, 'ArrowDown', 0)).toBe(0)
  })
})
