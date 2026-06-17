import { describe, it, expect } from 'vitest'
import { toolLabel } from './tool-label'

describe('toolLabel', () => {
  it('labels the place-furniture tool as Furniture', () => {
    expect(toolLabel('place-furniture')).toBe('Furniture')
  })

  it('preserves the labels for existing tools', () => {
    expect(toolLabel('select')).toBe('Select')
    expect(toolLabel('place-opening')).toBe('Opening')
    expect(toolLabel('draw-wall')).toBe('Wall')
  })
})
