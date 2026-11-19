import { _roots as canvasRoots } from '@react-three/fiber'
import type { Object3D } from 'three'
import type { FrameWatch } from './frame-collection'
import { sceneHost } from './page-layout'
import { nextTask } from './page-waits'

/**
 * The longest wait for the 3D scene to take the new scene root after an edit that changes the
 * scene. The canvas library commits its scene in its own React root, in a later task of React's
 * scheduler than the editor's commit; a few tasks are enough, so a wait this long means the edit
 * did not reach the 3D view.
 */
const SCENE_COMMIT_LIMIT_MS = 5000

/**
 * The wait for an edit that changes nothing in the scene (renaming the project): the live view
 * keeps its scene root, so the page waits this long for a change that does not come and goes on.
 */
const NO_SCENE_CHANGE_WAIT_MS = 100

/** The reference edits that change nothing in the 3D scene, so the scene root stays the same. */
const EDITS_WITHOUT_SCENE_CHANGE: ReadonlySet<string> = new Set(['rename-project'])

/**
 * The top-level objects of the live view's 3D scene, read from the canvas library's root store of
 * the canvas that is in the page now. The library releases the root of an unmounted canvas a little
 * later, so its store can still hold the root of the previous view.
 */
export function sceneChildren(): readonly Object3D[] {
  const mounted = [...canvasRoots.entries()].filter(
    ([canvas]) => canvas instanceof HTMLCanvasElement && sceneHost().contains(canvas),
  )
  const [entry] = mounted
  if (entry === undefined || mounted.length > 1) {
    throw new Error(`The timing page expects one mounted 3D canvas, and found ${mounted.length}`)
  }
  return [...entry[1].store.getState().scene.children]
}

/** True when the scene holds a top-level object that it did not hold before: a new scene root. */
export function hasNewSceneRoot(before: readonly Object3D[]): boolean {
  const earlier = new Set(before)
  return sceneChildren().some((child) => !earlier.has(child))
}

/**
 * Waits, polling on timer tasks and never on frames, until the 3D scene has taken a new scene root
 * after the edit, so the next frame draws the edited scene. The caller holds the page's frame
 * callbacks meanwhile; the commit does not need them, because the canvas library commits its scene
 * in a task of React's scheduler. For an edit that changes nothing in the scene the wait ends after
 * {@link NO_SCENE_CHANGE_WAIT_MS}. Throws when an edit that changes the scene has not reached it
 * within {@link SCENE_COMMIT_LIMIT_MS}.
 */
export async function waitForSceneCommit(
  watch: FrameWatch,
  editName: string,
  before: readonly Object3D[],
): Promise<void> {
  const changesScene = !EDITS_WITHOUT_SCENE_CHANGE.has(editName)
  const limitMs = changesScene ? SCENE_COMMIT_LIMIT_MS : NO_SCENE_CHANGE_WAIT_MS
  const startMs = performance.now()
  while (!hasNewSceneRoot(before)) {
    if (performance.now() - startMs > limitMs) {
      if (!changesScene) return
      throw new Error(
        `The edit "${editName}" did not reach the 3D scene of "${watch.what}" within ` +
          `${SCENE_COMMIT_LIMIT_MS} ms, so nothing was measured`,
      )
    }
    await nextTask()
    watch.checkHealth()
  }
}
