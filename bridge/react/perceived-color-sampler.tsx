import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { createCanvasPixelReader } from '../../engine'
import type { PerceivedColorStore } from '../perceived-color/perceived-color-store'

import { fulfillPerceivedColorSample } from './fulfill-perceived-color-sample'

// Priority 2 so this callback runs AFTER the ambient-occlusion render
// takeover, which draws at priority 1 (see
// ambient-occlusion-render-takeover.tsx). Reading before that draw would
// sample the previous frame's pixels instead of the one just composited.
const SAMPLE_PRIORITY = 2

// The read happens inside the frame callback because the renderer does not
// preserve its drawing buffer: the buffer holds a frame's pixels only until
// the compositor takes it, so a readback from outside the frame reads an
// already-cleared buffer, exactly as documented for the end-to-end helpers
// in e2e/tests/scene-helpers.ts. Sampling inside the frame is also what
// makes the value trustworthy: at that moment the pixels are already
// tone-mapped, already sRGB-encoded, and the occlusion pass has already
// composited.
function ActivePerceivedColorSampler({ store }: { store: PerceivedColorStore }) {
  const canvas = useThree((state) => state.gl.domElement)
  const reader = useMemo(() => createCanvasPixelReader(canvas), [canvas])

  useFrame(() => fulfillPerceivedColorSample(store, reader), SAMPLE_PRIORITY)

  return null
}

/**
 * Fulfills pending perceived-color requests once per frame, sampling the
 * live canvas at whatever point was last requested. Renders nothing; it
 * only registers the per-frame read, and registers no work at all when
 * there is no store to read requests from.
 */
export function PerceivedColorSampler({ store }: { store: PerceivedColorStore | null }) {
  if (store === null) return null
  return <ActivePerceivedColorSampler store={store} />
}
