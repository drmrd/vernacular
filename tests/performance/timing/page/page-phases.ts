import type { Command } from '../../../../core'
import {
  REFERENCE_EDITS,
  createReferenceProject,
  type ReferenceEdit,
} from '../../reference-project'
import { required } from '../../required'
import { timePlanRedraw } from '../plan-redraw-timing'
import type { TimingPhases } from '../run-timing'
import { createSceneUpdateBench, timeSceneUpdate } from '../scene-update-timing'
import { referenceDragFrames } from '../scripted-drag'
import type { SampleCounts } from '../timing-record'
import type { PageInstruments } from './page-instruments'
import { planCanvas } from './page-layout'
import { observePage } from './page-observe'
import { collectGarbage, frameWithinLimit } from './page-waits'
import { createSceneStage } from './scene-stage'

/** The phases of one run in the page, and the clean-up after it. */
export interface PagePhases {
  readonly phases: TimingPhases
  /** Unmounts the live view; the page calls it when the run has ended, however it ended. */
  readonly dispose: () => void
}

function now(): number {
  return performance.now()
}

/** Plan redraw: drawPlan on the visible 800 x 600 canvas, one draw per animation frame. */
async function planRedraw(instruments: PageInstruments, counts: SampleCounts): Promise<number[]> {
  const project = createReferenceProject()
  const floor = required(project.floors[0], 'ground floor')
  const ctx = planCanvas().getContext('2d')
  if (ctx === null) throw new Error('The plan canvas gave no 2D context, so nothing was measured')
  return timePlanRedraw({
    ctx,
    frames: referenceDragFrames(project, floor, counts.warmup + counts.timed),
    counts,
    now,
    nextFrame: async () => {
      await frameWithinLimit(instruments.hostFrame, 'the plan redraw')
    },
  })
}

function editCommands(edit: ReferenceEdit, counts: SampleCounts): Command[] {
  const pristine = createReferenceProject()
  return Array.from({ length: counts.warmup + counts.timed }, () => edit.command(pristine))
}

/**
 * 3D update: one bench, so the reconciler cache stays warm from edit to edit; the commands of
 * each edit come from a second reference project that no command touches.
 */
function sceneUpdate(counts: SampleCounts): Record<string, number[]> {
  const bench = createSceneUpdateBench()
  bench.reconcile()
  return Object.fromEntries(
    REFERENCE_EDITS.map((edit) => [
      edit.name,
      timeSceneUpdate({ bench, commands: editCommands(edit, counts), counts, now }),
    ]),
  )
}

/**
 * The browser side of a timing run. Each measuring phase starts with a garbage collection when the
 * browser exposes `gc`. No phase logs or writes to the page other than through its canvases.
 */
export function createPagePhases(instruments: PageInstruments): PagePhases {
  const stage = createSceneStage(instruments.probe)
  const phases: TimingPhases = {
    observe: () => observePage(instruments),
    planRedraw: (counts) => {
      collectGarbage()
      return planRedraw(instruments, counts)
    },
    sceneUpdate: async (counts) => {
      collectGarbage()
      return sceneUpdate(counts)
    },
    renderFrames: (counts) => {
      collectGarbage()
      return stage.renderFrames(counts)
    },
    renderAfterEdits: (counts) => {
      collectGarbage()
      return stage.renderAfterEdits(counts)
    },
  }
  return { phases, dispose: stage.dispose }
}
