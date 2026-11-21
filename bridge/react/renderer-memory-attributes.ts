/** The renderer's live resource counts: geometries and textures it currently holds on the GPU. */
export interface RendererMemoryCounts {
  geometries: number
  textures: number
}

/** The renderer as the memory probe reads it, typed structurally so bridge imports no Three.js. */
export type MemoryInfoRenderer = { info: { memory: RendererMemoryCounts } }

const GEOMETRIES_ATTRIBUTE = 'data-renderer-geometries'
const TEXTURES_ATTRIBUTE = 'data-renderer-textures'

/** Writes the renderer's live geometry and texture counts onto the element as data attributes. */
export function writeRendererMemory(element: Element, renderer: MemoryInfoRenderer): void {
  element.setAttribute(GEOMETRIES_ATTRIBUTE, String(renderer.info.memory.geometries))
  element.setAttribute(TEXTURES_ATTRIBUTE, String(renderer.info.memory.textures))
}
