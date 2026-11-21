import type { FramedScene } from '../../../bridge/react/framed-scene'
import { createFramedSceneReconciler } from '../../../bridge/react/framed-scene-reconciler'
import { viewSceneGraph } from '../../../bridge/react/view-scene-graph'
import type { Command } from '../../../core'
import { createReferenceSession } from './reference-session'
import type { EditorSession } from '../../../bridge'
import type { SampleCounts } from './timing-record'

/** The steps of one 3D update sample, so a test can replace them with a logging stand-in. */
export interface SceneUpdateBench {
  /** Dispatches the command on the session. */
  apply(command: Command): void
  /** Derives the scene graph, scopes it to the whole building, and reconciles it. */
  reconcile(): void
  /** Undoes the last command of the session. */
  undo(): void
  /** The framed scene of the last reconcile, or undefined before the first one. */
  lastScene(): FramedScene | undefined
}

// The building scope does not use the active floor; the scoping function still needs the argument.
const ACTIVE_FLOOR_ID = 'floor-1'

/**
 * A bench on the given session (a new reference session by default). It keeps the session and
 * one reconciler for its whole life, so the reconciler cache stays warm between samples. The
 * reconcile covers the whole building with the underground shown, not the live view's default
 * floor scope, because the budget of the design specification covers the whole project and the
 * count gate reconciles the building too.
 */
export function createSceneUpdateBench(
  session: EditorSession = createReferenceSession(),
): SceneUpdateBench {
  const reconciler = createFramedSceneReconciler()
  let scene: FramedScene | undefined
  return {
    apply: (command) => session.dispatch(command),
    reconcile: () => {
      const viewGraph = viewSceneGraph({
        rawGraph: session.getSceneGraph(),
        scope: 'building',
        activeFloorId: ACTIVE_FLOOR_ID,
        includeUnderground: true,
        cameraMode: 'orbit',
      })
      scene = reconciler.reconcile(viewGraph, session.getProject().paint ?? {})
    },
    undo: () => {
      session.undo()
    },
    lastScene: () => scene,
  }
}

/** What one 3D update measurement needs. */
export interface SceneUpdateTiming {
  bench: SceneUpdateBench
  /** The warm-up commands first, then the timed ones, built before the loop. */
  commands: readonly Command[]
  counts: SampleCounts
  now: () => number
}

/**
 * The durations, in milliseconds, of the timed 3D updates: one sample for each timed command.
 *
 * The first `counts.warmup` commands are warm-up samples and the next `counts.timed` commands
 * are timed. A list shorter than `warmup + timed` throws; the list is never cycled. Every
 * sample runs the command, a reconcile, an undo and a reconcile. A warm-up sample reads no
 * clock. A timed sample reads the clock just before `apply` and just after the first reconcile
 * returns.
 *
 * Inside the interval: the command and its undo capture, the derivation of the scene graph,
 * the scoping to the building, and the reconciler's rebuild of the changed groups. Outside it:
 * React's render and commit of the live view, the attach of a new root, the GPU upload of new
 * buffers, and the undo with its reconcile that resets the document for the next sample.
 *
 * The bench gives the reconciler no furniture model lookup, so furniture is built as boxes, as
 * the count gate does; a project with loaded furniture models would do more work there.
 */
export function timeSceneUpdate(timing: SceneUpdateTiming): number[] {
  const { bench, commands, counts, now } = timing
  const needed = counts.warmup + counts.timed
  if (commands.length < needed) {
    throw new Error(
      `A 3D update timing needs ${needed} commands (warm-up plus timed) but was given ${commands.length}`,
    )
  }
  const samples: number[] = []
  commands.slice(0, needed).forEach((command, index) => {
    const timedSample = index >= counts.warmup
    const startMs = timedSample ? now() : 0
    bench.apply(command)
    bench.reconcile()
    if (timedSample) {
      samples.push(now() - startMs)
    }
    bench.undo()
    bench.reconcile()
  })
  return samples
}
