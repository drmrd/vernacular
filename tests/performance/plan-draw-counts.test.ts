import { beforeAll, describe, expect, it } from 'vitest'
import type { Floor, Project } from '../../core'
import { drawPlan } from '../../editor/plan/draw-plan'
import { recordingContext } from '../../editor/plan/draw-plan-test-fixtures'
import { isUpdatingBaseline, readBaseline, writeBaselineSection } from './baseline-file'
import { createReferenceProject } from './reference-project'
import { referenceDrawOptions } from './reference-plan-scene'

const BASELINE_SECTION = 'planDrawOperations'

interface DrawOperationCount {
  total: number
  byMethod: Record<string, number>
}

/** The drawing-context calls of one redraw of a floor, in total and by method name. */
function countDrawOperations(project: Project, floor: Floor): DrawOperationCount {
  const recorder = recordingContext()
  drawPlan(recorder.ctx, referenceDrawOptions(project, floor))
  const byMethod: Record<string, number> = {}
  for (const method of [...recorder.ops].sort()) {
    byMethod[method] = (byMethod[method] ?? 0) + 1
  }
  return { total: recorder.ops.length, byMethod }
}

function countEveryFloor(project: Project): Record<string, DrawOperationCount> {
  return Object.fromEntries(
    project.floors.map((floor) => [floor.id, countDrawOperations(project, floor)]),
  )
}

describe('the plan draw operations of the reference project', () => {
  const project = createReferenceProject()
  const measured = countEveryFloor(project)

  beforeAll(() => {
    if (isUpdatingBaseline()) {
      writeBaselineSection(BASELINE_SECTION, measured)
    }
  })

  it('records a count for every floor and no other', () => {
    const recorded = readBaseline()[BASELINE_SECTION] as Record<string, DrawOperationCount>

    expect(Object.keys(recorded).sort()).toEqual(project.floors.map((floor) => floor.id).sort())
  })

  it.each(project.floors)(
    'one redraw of $name makes the context calls recorded in the baseline',
    (floor) => {
      const recorded = readBaseline()[BASELINE_SECTION] as Record<string, DrawOperationCount>

      expect(measured[floor.id]).toEqual(recorded[floor.id])
    },
  )

  it('is the same count on every redraw', () => {
    expect(countEveryFloor(createReferenceProject())).toEqual(measured)
  })
})
