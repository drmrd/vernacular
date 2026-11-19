import { createRoot, type Root } from 'react-dom/client'
import {
  createEnvironmentSessionStore,
  createSceneSessionStore,
  type EditorSession,
} from '../../../../bridge'
import {
  SCENE_READY_ATTRIBUTE,
  SCENE_RENDERER_FAILED_ATTRIBUTE,
} from '../../../../bridge/react/scene-readiness'
import type { Command } from '../../../../core'
import { REFERENCE_EDITS, createReferenceProject } from '../../reference-project'
import type { FrameProbe, FrameSample } from '../frame-probe'
import type { ReferenceSceneStores } from '../reference-scene-stage'
import { createReferenceSession } from '../reference-session'
import { RENDER_VARIANTS, type RenderVariant } from '../render-variants'
import type { SampleCounts } from '../timing-record'
import { collectFrames, frameStartingAfter, type FrameWatch } from './frame-collection'
import { LiveView } from './live-view'
import { checkSceneCanvasSize, sceneHost } from './page-layout'
import { collectGarbage, nextPoll, nextTask } from './page-waits'

/** The longest wait for a new live view to draw its first frame after its pipelines settled. */
const READY_LIMIT_MS = 30_000
/** The frames that pass untimed after each undo, and before the first edit. */
const UNTIMED_FRAMES_AFTER_UNDO = 2
/** The view in which the first frame after each edit is timed. */
const AFTER_EDIT_VARIANT_NAME = 'building, schematic'

/** The two render phases of the page: the live view mounted for each variant and edit. */
export interface SceneStage {
  renderFrames(counts: SampleCounts): Promise<Record<string, FrameSample[]>>
  renderAfterEdits(counts: SampleCounts): Promise<Record<string, FrameSample[]>>
  /** Unmounts the live view. */
  dispose(): void
}

interface MountedView {
  readonly root: Root
  readonly stores: ReferenceSceneStores
  readonly watch: FrameWatch
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function healthCheck(host: HTMLElement, thrown: () => unknown, what: string): () => void {
  return () => {
    const failed = host.querySelector(`[${SCENE_RENDERER_FAILED_ATTRIBUTE}]`)
    if (failed !== null) {
      const kind = failed.getAttribute(SCENE_RENDERER_FAILED_ATTRIBUTE) ?? 'unknown'
      throw new Error(
        `The live view of "${what}" reported a renderer failure ("${kind}"), so nothing was measured`,
      )
    }
    const error = thrown()
    if (error !== undefined) {
      throw new Error(
        `The live view of "${what}" threw, so nothing was measured: ${errorText(error)}`,
      )
    }
  }
}

function variantStores(session: EditorSession, variant: RenderVariant): ReferenceSceneStores {
  const stores = {
    session,
    environment: createEnvironmentSessionStore(),
    sceneSession: createSceneSessionStore(),
  }
  stores.sceneSession.updateSceneSession({ scope: variant.scope })
  stores.environment.setEnvironment({
    ...stores.environment.getEnvironment(),
    mode: variant.lighting,
  })
  return stores
}

function mountView(probe: FrameProbe, session: EditorSession, variant: RenderVariant): MountedView {
  const host = sceneHost()
  let thrown: unknown
  const root = createRoot(host, {
    onUncaughtError: (error) => {
      thrown = error
    },
  })
  const stores = variantStores(session, variant)
  root.render(<LiveView stores={stores} />)
  const watch = {
    probe,
    checkHealth: healthCheck(host, () => thrown, variant.name),
    what: variant.name,
  }
  return { root, stores, watch }
}

function isReady(view: MountedView): boolean {
  const readyCanvas = sceneHost().querySelector(`[${SCENE_READY_ATTRIBUTE}="true"]`)
  return (
    readyCanvas !== null &&
    view.stores.sceneSession.getSceneSession().frameDrawnSincePipelineSettled
  )
}

/** Waits for the readiness attribute and the session flag; the frames until then are dropped. */
async function waitUntilReady(view: MountedView): Promise<void> {
  const startMs = performance.now()
  while (!isReady(view)) {
    if (performance.now() - startMs > READY_LIMIT_MS) {
      throw new Error(
        `The live view of "${view.watch.what}" was not ready within ${READY_LIMIT_MS} ms, ` +
          'so nothing was measured',
      )
    }
    await nextPoll()
    view.watch.checkHealth()
    view.watch.probe.takeFrames()
  }
  checkSceneCanvasSize(sceneHost())
}

/** The warm-up frames unpaced, then the timed frames paced, each starting with an idle GPU. */
async function timedFrames(watch: FrameWatch, counts: SampleCounts): Promise<FrameSample[]> {
  await collectFrames(watch, counts.warmup, 0)
  watch.probe.setPaced(true)
  try {
    return await collectFrames(watch, counts.timed, performance.now())
  } finally {
    watch.probe.setPaced(false)
  }
}

/** Dispatches the edit, lets React commit, takes the next frame, undoes, lets frames pass. */
async function framesAfterEdit(
  view: MountedView,
  command: () => Command,
  timed: number,
): Promise<FrameSample[]> {
  const frames: FrameSample[] = []
  for (let sample = 0; sample < timed; sample += 1) {
    await nextTask()
    view.stores.session.dispatch(command())
    await nextTask()
    frames.push(await frameStartingAfter(view.watch, performance.now()))
    view.stores.session.undo()
    await collectFrames(view.watch, UNTIMED_FRAMES_AFTER_UNDO, performance.now())
  }
  return frames
}

function afterEditVariant(): RenderVariant {
  const variant = RENDER_VARIANTS.find((each) => each.name === AFTER_EDIT_VARIANT_NAME)
  if (variant === undefined)
    throw new Error(`No render variant is named "${AFTER_EDIT_VARIANT_NAME}"`)
  return variant
}

/** The live view on the page's own reference session, mounted anew for each variant. */
export function createSceneStage(probe: FrameProbe): SceneStage {
  const session = createReferenceSession()
  let current: MountedView | null = null
  const dispose = (): void => {
    current?.root.unmount()
    current = null
  }
  const mount = async (variant: RenderVariant): Promise<MountedView> => {
    dispose()
    collectGarbage()
    current = mountView(probe, session, variant)
    await waitUntilReady(current)
    return current
  }
  return {
    renderFrames: async (counts) => {
      const byVariant: Record<string, FrameSample[]> = {}
      for (const variant of RENDER_VARIANTS) {
        byVariant[variant.name] = await timedFrames((await mount(variant)).watch, counts)
      }
      return byVariant
    },
    renderAfterEdits: async (counts) => {
      const view = await mount(afterEditVariant())
      return timeEdits(view, counts)
    },
    dispose,
  }
}

async function timeEdits(
  view: MountedView,
  counts: SampleCounts,
): Promise<Record<string, FrameSample[]>> {
  const pristine = createReferenceProject()
  const byEdit: Record<string, FrameSample[]> = {}
  view.watch.probe.setPaced(true)
  try {
    await collectFrames(view.watch, UNTIMED_FRAMES_AFTER_UNDO, performance.now())
    for (const edit of REFERENCE_EDITS) {
      byEdit[edit.name] = await framesAfterEdit(view, () => edit.command(pristine), counts.timed)
    }
    return byEdit
  } finally {
    view.watch.probe.setPaced(false)
  }
}
