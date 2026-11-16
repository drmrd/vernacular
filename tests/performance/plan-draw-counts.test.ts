import { beforeAll, describe, expect, it } from 'vitest'
import type { Floor, Project } from '../../core'
import { drawPlan, type DrawPlanOptions } from '../../editor/plan/draw-plan'
import { recordingContext } from '../../editor/plan/draw-plan-test-fixtures'
import {
  countChangedMessage,
  isUpdatingBaseline,
  readBaseline,
  writeBaseline,
} from './baseline-file'
import { createReferenceProject } from './reference-project'
import { DIMENSIONS_HIDDEN, referenceDrawOptions } from './reference-plan-scene'
import { required } from './required'

const BASELINE_FILE = 'baseline-plan-draw.json'
const GATE_MESSAGE = countChangedMessage('plan draw operation count')

interface DrawOperationCount {
  total: number
  byMethod: Record<string, number>
}

/** The drawing-context calls of one redraw, in total and by method name. */
function countDrawOperations(options: DrawPlanOptions): DrawOperationCount {
  const recorder = recordingContext()
  drawPlan(recorder.ctx, options)
  const byMethod: Record<string, number> = {}
  for (const method of [...recorder.ops].sort()) {
    byMethod[method] = (byMethod[method] ?? 0) + 1
  }
  return { total: recorder.ops.length, byMethod }
}

function countEveryFloor(project: Project): Record<string, DrawOperationCount> {
  return Object.fromEntries(
    project.floors.map((floor: Floor) => [
      floor.id,
      countDrawOperations(referenceDrawOptions(project, floor)),
    ]),
  )
}

function recordedCounts(): Record<string, DrawOperationCount> {
  return readBaseline(BASELINE_FILE) as Record<string, DrawOperationCount>
}

describe('the plan draw operations of the reference project', () => {
  const project = createReferenceProject()
  const measured = countEveryFloor(project)

  beforeAll(() => {
    if (isUpdatingBaseline()) {
      writeBaseline(BASELINE_FILE, measured)
    }
  })

  it('records a count for every floor and no other', () => {
    expect(Object.keys(recordedCounts()).sort()).toEqual(
      project.floors.map((floor) => floor.id).sort(),
    )
  })

  it.each(project.floors)(
    'one redraw of $name makes the context calls recorded in the baseline',
    (floor) => {
      expect(measured[floor.id], GATE_MESSAGE).toEqual(recordedCounts()[floor.id])
    },
  )

  it.each(project.floors)('one redraw of $name draws strokes and text', (floor) => {
    const count = required(measured[floor.id], `draw count of ${floor.id}`)

    expect(count.total).toBeGreaterThan(0)
    expect(Object.keys(count.byMethod)).toEqual(expect.arrayContaining(['fillText', 'stroke']))
  })

  it('draws less with the dimensions hidden than with them shown', () => {
    const floor = required(project.floors[0], 'ground floor')
    const hidden = countDrawOperations(referenceDrawOptions(project, floor, DIMENSIONS_HIDDEN))

    expect(hidden.total).toBeLessThan(required(measured[floor.id], 'ground floor count').total)
  })

  it('is the same count on every redraw', () => {
    expect(countEveryFloor(createReferenceProject())).toEqual(measured)
  })
})
