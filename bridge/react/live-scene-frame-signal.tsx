import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { frameMatchesCanvasSize, type FrameSizeState } from './drawn-frame-size'

// The live canvas's per-frame readiness signal, extracted from the scene view so that
// file stays within its size budget: the drawn scene revision the readiness boundary
// reads, and the in-canvas component that reports every counted frame to both readers
// that wait on one. A frame counts only when it was drawn at the canvas's current size.

// The scene revision of the last counted frame on this mount, null until the first one.
// The wrapper advertises it so the editor pane's readiness observer knows the scene has
// actually drawn, not merely mounted.
// eslint-disable-next-line react-refresh/only-export-components -- a hook, not a component, exported alongside LiveSceneFrameSignal because the two travel together everywhere they are used
export function useDrawnRevision() {
  const [drawnRevision, noteDrawnRevision] = useState<number | null>(null)
  return { drawnRevision, noteDrawnRevision }
}

// After AO_RENDER_PRIORITY (1) and SAMPLE_PRIORITY (2), so this fires once the frame is actually fully drawn.
const FRAME_SIGNAL_PRIORITY = 3

export interface LiveSceneFrameSignalProps {
  /** The scene revision the canvas holds in this commit. */
  revision: number
  /** Called once per revision, on the first counted frame that drew it. */
  onDrawnRevision: (revision: number) => void
  /** Called on every counted frame (feeds the live-view readiness facts). */
  onDrawnFrame: () => void
}

// Reports each counted frame to the two readers that wait on one. The drawn revision is
// reported once per revision, so the ref keeps every later frame from updating state. The
// live-view readiness fact re-arms instead: a pipeline build clears it and the first
// counted frame after that build settles has to set it again, so onDrawnFrame fires on
// every counted frame. A frame the size check rejects reports nothing.
export function LiveSceneFrameSignal({
  revision,
  onDrawnRevision,
  onDrawnFrame,
}: LiveSceneFrameSignalProps) {
  const reportedRevisionRef = useRef<number | null>(null)
  useFrame((state) => {
    // An orthographic camera has no aspect, which the optional field allows but TypeScript's
    // weak-type check cannot see through the camera union, so the state is asserted.
    if (!frameMatchesCanvasSize(state as FrameSizeState)) return
    onDrawnFrame()
    if (reportedRevisionRef.current === revision) return
    reportedRevisionRef.current = revision
    onDrawnRevision(revision)
  }, FRAME_SIGNAL_PRIORITY)
  return null
}
