import { describe, expect, it } from 'vitest'

import { writeRendererMemory } from './renderer-memory-attributes'

function rendererWithMemory(geometries: number, textures: number) {
  return { info: { memory: { geometries, textures } } }
}

describe('writeRendererMemory', () => {
  it("writes the renderer's live geometry and texture counts onto the element, and rewrites them when the counts change", () => {
    const element = document.createElement('div')

    writeRendererMemory(element, rendererWithMemory(7, 2))
    expect(element.getAttribute('data-renderer-geometries')).toBe('7')
    expect(element.getAttribute('data-renderer-textures')).toBe('2')

    writeRendererMemory(element, rendererWithMemory(5, 2))
    expect(element.getAttribute('data-renderer-geometries')).toBe('5')
    expect(element.getAttribute('data-renderer-textures')).toBe('2')
  })
})
