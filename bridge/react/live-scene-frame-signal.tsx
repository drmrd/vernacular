import { useFrame } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'

// The live canvas's per-frame readiness signal, extracted from the scene view so that
// file stays within its size budget: the first-frame flag the readiness boundary reads,
// and the in-canvas component that reports every drawn frame to both readers that wait
// on one.

// Flips once the live canvas has rendered its first frame, mirroring the harness
// canvas's data-harness-ready flip (scene-harness-view.tsx): the wrapper advertises
// it through sceneReadinessProps so the editor pane's readiness observer knows the
// scene has actually drawn, not merely mounted.
// eslint-disable-next-line react-refresh/only-export-components -- a hook, not a component, exported alongside LiveSceneFrameSignal because the two travel together everywhere they are used
export function useFirstFrameReadiness() {
  const [ready, setReady] = useState(false)
  const handleFirstFrame = useCallback(() => setReady(true), [])
  return { ready, handleFirstFrame }
}

// After AO_RENDER_PRIORITY (1) and SAMPLE_PRIORITY (2), so this fires once the frame is actually fully drawn.
const FRAME_SIGNAL_PRIORITY = 3

// Reports each drawn frame to the two readers that wait on one. The scene-readiness boundary
// cares about the first frame alone, so the ref guard keeps every later frame from re-invoking
// onFirstFrame. The live-view readiness fact re-arms instead: a pipeline build clears it and the
// first frame after that build settles has to set it again, so onDrawnFrame fires every frame.
export function LiveSceneFrameSignal({
  onFirstFrame,
  onDrawnFrame,
}: {
  onFirstFrame: () => void
  onDrawnFrame: () => void
}) {
  const firedRef = useRef(false)
  useFrame(() => {
    onDrawnFrame()
    if (firedRef.current) return
    firedRef.current = true
    onFirstFrame()
  }, FRAME_SIGNAL_PRIORITY)
  return null
}
