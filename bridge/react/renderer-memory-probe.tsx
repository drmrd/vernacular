import { useFrame, useThree } from '@react-three/fiber'

import { writeRendererMemory } from './renderer-memory-attributes'

// After the frame signal (3), so the write follows the draw that counts newly drawn geometry.
const RENDERER_MEMORY_PRIORITY = 4

function RendererMemoryWriter() {
  const gl = useThree((state) => state.gl)
  useFrame(() => {
    writeRendererMemory(gl.domElement, gl)
  }, RENDERER_MEMORY_PRIORITY)
  return null
}

/**
 * A test-only reader of the live renderer's resource counts: after each drawn frame it writes the
 * geometry and texture counts onto the canvas as data attributes, so an end-to-end test can check
 * that discarded scene builds free their GPU resources. It renders nothing, and registers no
 * per-frame work, unless the `?e2e` runtime flag is set, so it is inert in normal use.
 */
export function RendererMemoryProbe() {
  if (!new URLSearchParams(window.location.search).has('e2e')) return null
  return <RendererMemoryWriter />
}
