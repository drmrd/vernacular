import { useLayoutEffect } from 'react'

import type { FramedScene } from './framed-scene'

/** The framed scene to draw and the report that it is now drawn (FramedSceneState.onSceneAttached). */
export interface LiveSceneRootProps {
  framed: FramedScene
  onAttached: (scene: FramedScene) => () => void
}

/**
 * Draws the framed scene root inside the Canvas and reports it attached. The layout effect runs
 * in React Three Fiber's own React root, after the commit that detaches the replaced root and
 * attaches this one, so what the replaced scene drew can be freed then and not while a frame can
 * still draw it. Drawing and reporting sit in one component so they cannot drift apart.
 */
export function LiveSceneRoot({ framed, onAttached }: LiveSceneRootProps) {
  useLayoutEffect(() => onAttached(framed), [framed, onAttached])
  // Key the primitive on the rebuilt group so a new scene replaces the old one: React Three
  // Fiber does not re-attach a <primitive> when its object prop changes in place, only when the
  // element remounts.
  return <primitive key={framed.root.uuid} object={framed.root} />
}
