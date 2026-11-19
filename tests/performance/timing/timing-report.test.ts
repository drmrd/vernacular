import { describe, expect, it } from 'vitest'
import { comparisonWarnings, formatTimingReport } from './timing-report'
import {
  REFERENCE_EDIT_NAMES,
  RENDER_VARIANT_NAMES,
  aTimingRun,
  summary,
} from './timing-run-fixture'
import type { TimingRun } from './timing-record'

const MAX_LINE_LENGTH = 100
const MOVED_WALL = 'move-wall-endpoint'
const UPDATE_ROW = `3D update, ${MOVED_WALL}`

/** The lines of the report that start with the text: the rows of one kind of time. */
function rowsStartingWith(report: string, start: string): string[] {
  return report.split('\n').filter((line) => line.startsWith(start))
}

function allTimeRows(report: string): string[] {
  return ['Plan redraw', '3D update, ', '3D frame, ', '3D frame after '].flatMap((start) =>
    rowsStartingWith(report, start),
  )
}

function withEdit(edit: (run: TimingRun) => void): TimingRun {
  const run = aTimingRun()
  edit(run)
  return run
}

/** A pair of runs whose update of the moved wall has these medians, all else equal. */
function reportWithMedians(currentMs: number, baselineMs: number): string {
  const current = withEdit((run) => {
    run.times.sceneUpdate[MOVED_WALL] = summary(currentMs, currentMs + 2)
  })
  const baseline = withEdit((run) => {
    run.times.sceneUpdate[MOVED_WALL] = summary(baselineMs, baselineMs + 2)
  })
  return formatTimingReport(current, baseline)
}

describe('the timing report of a run with no baseline', () => {
  const report = formatTimingReport(aTimingRun(), undefined)

  it('says that times are reported and never gated', () => {
    expect(report).toContain('never gated')
  })

  it('says that the baseline was not measured', () => {
    expect(report).toContain('not measured')
  })

  it('has one row for the plan redraw', () => {
    expect(rowsStartingWith(report, 'Plan redraw')).toHaveLength(1)
  })

  it('has one row for the update of each reference edit', () => {
    const rows = rowsStartingWith(report, '3D update, ')

    expect(rows).toHaveLength(REFERENCE_EDIT_NAMES.length)
    REFERENCE_EDIT_NAMES.forEach((name) => {
      expect(rows.some((row) => row.startsWith(`3D update, ${name}`))).toBe(true)
    })
  })

  it('has a main-thread row and an until-GPU-done row for each render variant', () => {
    const rows = rowsStartingWith(report, '3D frame, ')

    expect(rows).toHaveLength(RENDER_VARIANT_NAMES.length * 2)
    RENDER_VARIANT_NAMES.forEach((name) => {
      expect(rows.some((row) => row.startsWith(`3D frame, ${name}, main thread`))).toBe(true)
      expect(rows.some((row) => row.startsWith(`3D frame, ${name}, until GPU done`))).toBe(true)
    })
  })

  it('has a main-thread row and an until-GPU-done row for the frame after each edit', () => {
    const rows = rowsStartingWith(report, '3D frame after ')

    expect(rows).toHaveLength(REFERENCE_EDIT_NAMES.length * 2)
    REFERENCE_EDIT_NAMES.forEach((name) => {
      expect(rows.some((row) => row.startsWith(`3D frame after ${name}, main thread`))).toBe(true)
      expect(rows.some((row) => row.startsWith(`3D frame after ${name}, until GPU done`))).toBe(
        true,
      )
    })
  })

  it('shows n/a in the change cell and not measured in the baseline cell of every time row', () => {
    const rows = allTimeRows(report)

    expect(rows).toHaveLength(27)
    rows.forEach((row) => {
      expect(row.endsWith('n/a')).toBe(true)
      expect(row).toContain('not measured')
    })
  })

  it('shows the median and the 95th percentile of a time with two decimals', () => {
    const [planRow] = rowsStartingWith(report, 'Plan redraw')

    expect(planRow).toContain('3.21')
    expect(planRow).toContain('5.40')
  })

  it('shows the budget of 8.0 ms on each update and frame row', () => {
    const rows = [
      ...rowsStartingWith(report, '3D update, '),
      ...rowsStartingWith(report, '3D frame'),
    ]

    expect(rows).toHaveLength(26)
    rows.forEach((row) => expect(row).toContain('8.0'))
  })

  it('shows the plan budget of 16.7 ms starred, with a footnote saying it is no stated budget', () => {
    const [planRow] = rowsStartingWith(report, 'Plan redraw')
    const [footnote] = rowsStartingWith(report, '* ')

    expect(planRow).toContain('16.7*')
    expect(footnote).toContain('one frame at 60 fps')
    expect(footnote).toContain('no plan budget')
  })

  it('lists what is not measured on a line of its own', () => {
    expect(rowsStartingWith(report, 'Not measured')).toHaveLength(1)
  })
})

describe('the change of a time against the baseline', () => {
  it('shows a slower time as a positive change in milliseconds with its ratio', () => {
    const [row] = rowsStartingWith(reportWithMedians(2.5, 2), UPDATE_ROW)

    expect(row).toContain('+0.50 ms (1.25x)')
  })

  // The surface does not define the other two forms; they follow the same pattern with an ASCII minus.
  it('shows a faster time as a negative change in milliseconds with its ratio', () => {
    const [row] = rowsStartingWith(reportWithMedians(2, 2.5), UPDATE_ROW)

    expect(row).toContain('-0.50 ms (0.80x)')
  })

  it('shows equal times as a change of +0.00 ms and 1.00x on every time row', () => {
    const report = formatTimingReport(aTimingRun(), aTimingRun())

    allTimeRows(report).forEach((row) => expect(row).toContain('+0.00 ms (1.00x)'))
  })

  it('shows the median of the baseline, and no n/a, on a row that has one', () => {
    const [row] = rowsStartingWith(reportWithMedians(2.5, 2), UPDATE_ROW)

    expect(row).toContain('2.00')
    expect(row).not.toContain('n/a')
  })
})

describe('the lines of the timing report', () => {
  function unusualCurrent(): TimingRun {
    return withEdit((run) => {
      run.conditions.power = 'battery'
      run.conditions.focused = false
      run.machine.browser = 'Chromium 143.0.7500.0 with a long build description attached'
      run.machine.webGpuAdapter = 'apple / metal-3 / Apple M5 Pro with a long device description'
    })
  }

  it.each([
    ['with no baseline', formatTimingReport(aTimingRun(), undefined)],
    ['with an equal baseline', formatTimingReport(aTimingRun(), aTimingRun())],
    ['with warnings', formatTimingReport(unusualCurrent(), aTimingRun())],
  ])('are at most 100 characters long %s', (_situation, report) => {
    report.split('\n').forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH)
    })
  })

  it('carry no escape character for color', () => {
    const report = formatTimingReport(unusualCurrent(), aTimingRun())

    expect(report).not.toContain('\u001b')
  })
})

describe('the warnings that compare a run with its baseline', () => {
  it('gives none for two equal clean runs', () => {
    expect(comparisonWarnings(aTimingRun(), aTimingRun())).toEqual([])
  })

  it('gives none for a clean run with no baseline', () => {
    expect(comparisonWarnings(aTimingRun(), undefined)).toEqual([])
  })

  it.each([
    {
      field: 'device pixel ratio',
      current: (run: TimingRun) => void (run.conditions.devicePixelRatio = 1.5),
      baseline: (run: TimingRun) => void (run.conditions.devicePixelRatio = 2.25),
      values: ['1.5', '2.25'],
    },
    {
      field: 'drawing buffer size',
      current: (run: TimingRun) =>
        void (run.conditions.sceneDrawingBufferPx = { width: 1280, height: 800 }),
      baseline: (run: TimingRun) =>
        void (run.conditions.sceneDrawingBufferPx = { width: 1920, height: 1200 }),
      values: ['1280 x 800', '1920 x 1200'],
    },
    {
      field: 'browser',
      current: (run: TimingRun) => void (run.machine.browser = 'Chromium 143.0.7500.0'),
      baseline: (run: TimingRun) => void (run.machine.browser = 'Chromium 141.0.7390.0'),
      values: ['Chromium 143.0.7500.0', 'Chromium 141.0.7390.0'],
    },
    {
      field: 'adapter',
      current: (run: TimingRun) =>
        void (run.machine.webGpuAdapter = 'apple / metal-3 / Apple M5 Max'),
      baseline: (run: TimingRun) =>
        void (run.machine.webGpuAdapter = 'apple / metal-3 / Apple M4 Pro'),
      values: ['Apple M5 Max', 'Apple M4 Pro'],
    },
    {
      field: 'processor',
      current: (run: TimingRun) => void (run.machine.processor = 'Apple M5 Max'),
      baseline: (run: TimingRun) => void (run.machine.processor = 'Apple M4 Pro'),
      values: ['Apple M5 Max', 'Apple M4 Pro'],
    },
  ])('gives one warning naming both values for a differing $field', (testCase) => {
    const current = withEdit(testCase.current)
    const baseline = withEdit(testCase.baseline)

    const warnings = comparisonWarnings(current, baseline)

    expect(warnings).toHaveLength(1)
    testCase.values.forEach((value) => expect(warnings[0]).toContain(value))
  })

  // The wording is the implementer's; the lower-cased phrase only has to name the condition.
  it.each([
    {
      condition: 'a quick current run',
      current: (run: TimingRun) => void (run.quick = true),
      baseline: () => undefined,
      phrase: 'quick',
    },
    {
      condition: 'a quick baseline',
      current: () => undefined,
      baseline: (run: TimingRun) => void (run.quick = true),
      phrase: 'quick',
    },
    {
      condition: 'battery power',
      current: (run: TimingRun) => void (run.conditions.power = 'battery'),
      baseline: () => undefined,
      phrase: 'battery',
    },
    {
      condition: 'an unknown power source',
      current: (run: TimingRun) => void (run.conditions.power = 'unknown'),
      baseline: () => undefined,
      phrase: 'unknown',
    },
    {
      condition: 'uncommitted changes',
      current: (run: TimingRun) => void (run.uncommittedChanges = true),
      baseline: () => undefined,
      phrase: 'uncommitted',
    },
    {
      condition: 'a window that was not focused',
      current: (run: TimingRun) => void (run.conditions.focused = false),
      baseline: () => undefined,
      phrase: 'focus',
    },
  ])('gives one warning for $condition', (testCase) => {
    const warnings = comparisonWarnings(withEdit(testCase.current), withEdit(testCase.baseline))

    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.toLowerCase()).toContain(testCase.phrase)
  })
})
