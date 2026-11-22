import { useState } from 'react'

export interface SceneRevisionCounter<Scene extends object> {
  /** The revision of this scene: the same number for the same object, one more for a new object. */
  revisionOf(scene: Scene): number
}

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

/** The live view's per-mount scene revision, read during render. */
export function useSceneRevision<Scene extends object>(scene: Scene): number {
  const [counter] = useState(() => createSceneRevisionCounter<Scene>())
  return counter.revisionOf(scene)
}
