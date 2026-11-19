import { describe, expect, it } from 'vitest'
import { comparisonWarnings, formatTimingReport } from './timing-report'
import { aTimingRun, summary } from './timing-run-fixture'
import type { TimingRun } from './timing-record'

const MOVED_WALL = 'move-wall-endpoint'
const UPDATE_ROW = `3D update, ${MOVED_WALL}`

function withEdit(edit: (run: TimingRun) => void): TimingRun {
  const run = aTimingRun()
  edit(run)
  return run
}

function rowsStartingWith(report: string, start: string): string[] {
  return report.split('\n').filter((line) => line.startsWith(start))
}

/** The lines above the first time row: the header of the report. */
function headerOf(report: string): string {
  const lines = report.split('\n')
  return lines
    .slice(
      0,
      lines.findIndex((line) => line.startsWith('Plan redraw')),
    )
    .join('\n')
}

/** The report of a run whose update of the moved wall has this median, against a baseline with that one. */
function updateRowWithMedians(currentMs: number, baselineMs: number): string {
  const current = withEdit((run) => {
    run.times.sceneUpdate[MOVED_WALL] = summary(currentMs, currentMs + 2)
  })
  const baseline = withEdit((run) => {
    run.times.sceneUpdate[MOVED_WALL] = summary(baselineMs, baselineMs + 2)
  })
  const [row] = rowsStartingWith(formatTimingReport(current, baseline), UPDATE_ROW)
  return row ?? ''
}

describe('the change of a time whose baseline median is zero', () => {
  it('shows the difference in milliseconds and n/a in place of a ratio', () => {
    expect(updateRowWithMedians(0.4, 0)).toContain('+0.40 ms (n/a)')
  })

  it('holds no Infinity and no NaN anywhere in the report', () => {
    const current = withEdit((run) => {
      run.times.sceneUpdate[MOVED_WALL] = summary(0.4, 1)
      run.times.planRedraw = summary(0, 0)
    })
    const baseline = withEdit((run) => {
      run.times.sceneUpdate[MOVED_WALL] = summary(0, 0)
      run.times.planRedraw = summary(0, 0)
    })

    const report = formatTimingReport(current, baseline)

    expect(report).not.toContain('Infinity')
    expect(report).not.toContain('NaN')
  })
})

describe('the change of a time whose run median is zero', () => {
  it('reads -0.40 ms (0.00x) against a baseline median of 0.40, with no negative zero', () => {
    const row = updateRowWithMedians(0, 0.4)

    expect(row).toContain('-0.40 ms (0.00x)')
    expect(row).not.toContain('-0.00')
  })
})

describe('the change of a time against the two medians beside it', () => {
  it('is computed from the medians as printed, so 2.004 against 1.996 reads 2.00, 2.00 and +0.00 ms (1.00x)', () => {
    const row = updateRowWithMedians(2.004, 1.996)

    expect(row).toMatch(/\b2\.00\b.*\b2\.00\b.*\+0\.00 ms \(1\.00x\)/)
  })
})

describe('the header of the timing report', () => {
  it('marks a quick run as a quick check and not a measurement', () => {
    const report = formatTimingReport(
      withEdit((run) => void (run.quick = true)),
      undefined,
    )

    expect(headerOf(report).toLowerCase()).toContain('quick check, not a measurement')
  })

  it('does not mark a run that is not quick', () => {
    expect(headerOf(formatTimingReport(aTimingRun(), undefined)).toLowerCase()).not.toContain(
      'quick check',
    )
  })

  it('names the baseline by the first eight characters of its commit and its time taken', () => {
    const baseline = withEdit((run) => {
      run.commit = 'f00dfacecafebeef'
      run.takenAt = '2026-11-14T09:30:00-05:00'
    })

    const header = headerOf(formatTimingReport(aTimingRun(), baseline))
    const baselineLines = header.split('\n').filter((line) => line.includes('f00dface'))

    expect(baselineLines.some((line) => line.includes('2026-11-14T09:30:00-05:00'))).toBe(true)
  })

  it('says on the adapter line that the adapter is hardware', () => {
    const [adapterLine] = rowsStartingWith(
      headerOf(formatTimingReport(aTimingRun(), undefined)),
      'Adapter',
    )

    expect(adapterLine).toContain('hardware')
  })
})

describe('a large value in the timing report', () => {
  it('is printed in full, even when its line is longer than 100 characters', () => {
    const current = withEdit((run) => {
      run.times.planRedraw = summary(3.21, 1234.56)
    })

    const report = formatTimingReport(current, undefined)

    expect(report).toContain('1234.56')
  })
})

describe('the warnings that compare the canvas sizes of a run with its baseline', () => {
  it('gives one warning naming both sizes when the plan canvas size differs', () => {
    const current = withEdit(
      (run) => void (run.conditions.planCanvasPx = { width: 800, height: 600 }),
    )
    const baseline = withEdit(
      (run) => void (run.conditions.planCanvasPx = { width: 1024, height: 768 }),
    )

    const warnings = comparisonWarnings(current, baseline)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('800 x 600')
    expect(warnings[0]).toContain('1024 x 768')
  })

  it('gives one warning naming both sizes when the CSS size of the 3D canvas differs', () => {
    const current = withEdit(
      (run) => void (run.conditions.sceneCanvasCssPx = { width: 960, height: 600 }),
    )
    const baseline = withEdit(
      (run) => void (run.conditions.sceneCanvasCssPx = { width: 1280, height: 720 }),
    )

    const warnings = comparisonWarnings(current, baseline)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('960 x 600')
    expect(warnings[0]).toContain('1280 x 720')
  })
})
