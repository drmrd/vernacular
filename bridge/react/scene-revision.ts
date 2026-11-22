import { useState } from 'react'

export interface SceneRevisionCounter<Scene extends object> {
  /** The revision of this scene: the same number for the same object, one more for a new object. */
  revisionOf(scene: Scene): number
}

/** A counter for one mount of the live view that only goes up; see `revisionOf`. */
export function createSceneRevisionCounter<Scene extends object>(): SceneRevisionCounter<Scene> {
  let latestScene: Scene | undefined
  let revision = 0
  return {
    revisionOf(scene) {
      if (scene !== latestScene) {
        latestScene = scene
        revision += 1
      }
      return revision
    },
  }
}

/**
 * The live view's per-mount scene revision, read during render.
 *
 * `revisionOf` also updates the held counter during render. That is safe because
 * calling it twice with the same scene object gives the same number, so a
 * StrictMode double render or a Suspense retry cannot count twice. A discarded
 * render with a new scene can skip a number, which is allowed.
 */
export function useSceneRevision<Scene extends object>(scene: Scene): number {
  const [counter] = useState(() => createSceneRevisionCounter<Scene>())
  return counter.revisionOf(scene)
}
