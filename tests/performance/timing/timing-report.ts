import { sizeText, type FrameTiming, type TimingRun, type TimingSummary } from './timing-record'
import { comparisonWarnings } from './timing-comparison'
import { roundedToStep } from './timing-statistics'

export { comparisonWarnings }

/** The budget of a 3D scene update, in milliseconds (design specification 6.10). */
export const SCENE_UPDATE_BUDGET_MS = 8
/** The budget of one 3D frame, in milliseconds (design specification 6.10). */
export const RENDER_BUDGET_MS = 8
/** One frame at 60 a second, in milliseconds: the specification states no plan budget. */
export const PLAN_FRAME_MS = 16.7

/** The longest line the report prints, in characters. */
const LINE_WIDTH = 100
/** The width of the label column of the header lines, in characters. */
const HEADER_LABEL_WIDTH = 13
/** The width of the Budget column, in characters. */
const BUDGET_WIDTH = 6
/** The width of the Median column and of the p95 column, in characters. */
const TIME_WIDTH = 6
/** The width of the Base med/p95 column, in characters; wide enough for "not measured". */
const BASE_WIDTH = 12
/** The space between two columns of the table. */
const COLUMN_GAP = ' '
/** Decimals printed for a measured time; matches the 0.01 ms step of the statistics module. */
const TIME_DECIMALS = 2
/** Decimals of a budget. */
const BUDGET_DECIMALS = 1
/** How many characters of the commit the report prints. */
const COMMIT_LENGTH = 8

const NOT_MEASURED = 'not measured'
const BASE_HEADING = 'Base med/p95'
const MEDIAN_P95_SEPARATOR = '/'
const NOT_AVAILABLE = 'n/a'
const PLAN_ROW_LABEL = 'Plan redraw, endpoint drag, ground floor'
const PLAN_BUDGET_NOTE = '* one frame at 60 fps; design specification 6.10 states no plan budget.'
const FRAME_NOTE =
  'Note: 3D frames are paced, each timed alone; the figure that waits for the GPU is an upper bound; ' +
  'furniture is drawn as boxes.'
const UNMEASURED_LINE =
  'Not measured: GPU raster of the plan canvas; React render and commit; the first frame after load.'

interface TimingRow {
  label: string
  budget: string
  current: TimingSummary
  baseline: TimingSummary | undefined
}

function lookup<Value>(record: Record<string, Value> | undefined, key: string): Value | undefined {
  // find over the entries, not record[key]: a scenario name is data and must never hit a prototype member.
  return record === undefined
    ? undefined
    : Object.entries(record).find(([name]) => name === key)?.[1]
}

function budgetCell(budgetMs: number): string {
  return budgetMs.toFixed(BUDGET_DECIMALS)
}

function frameRows(prefix: string, frame: FrameTiming, baseline?: FrameTiming): TimingRow[] {
  const budget = budgetCell(RENDER_BUDGET_MS)
  return [
    {
      label: `${prefix}, main thread`,
      budget,
      current: frame.mainThread,
      baseline: baseline?.mainThread,
    },
    {
      label: `${prefix}, until GPU done`,
      budget,
      current: frame.untilGpuDone,
      baseline: baseline?.untilGpuDone,
    },
  ]
}

function timingRows(run: TimingRun, baseline: TimingRun | undefined): TimingRow[] {
  const before = baseline?.times
  return [
    {
      label: PLAN_ROW_LABEL,
      budget: `${budgetCell(PLAN_FRAME_MS)}*`,
      current: run.times.planRedraw,
      baseline: before?.planRedraw,
    },
    ...Object.entries(run.times.sceneUpdate).map(([name, current]) => ({
      label: `3D update, ${name}`,
      budget: budgetCell(SCENE_UPDATE_BUDGET_MS),
      current,
      baseline: lookup(before?.sceneUpdate, name),
    })),
    ...Object.entries(run.times.renderFrame).flatMap(([name, frame]) =>
      frameRows(`3D frame, ${name}`, frame, lookup(before?.renderFrame, name)),
    ),
    ...Object.entries(run.times.renderAfterEdit).flatMap(([name, frame]) =>
      frameRows(`3D frame after ${name}`, frame, lookup(before?.renderAfterEdit, name)),
    ),
  ]
}

function milliseconds(value: number): string {
  return value.toFixed(TIME_DECIMALS)
}

/** The change of the medians as printed: both are rounded first, so the printed cells subtract exactly. */
function changeCell(current: TimingSummary, baseline: TimingSummary | undefined): string {
  if (baseline === undefined) return NOT_AVAILABLE
  const now = roundedToStep(current.medianMs)
  const before = roundedToStep(baseline.medianMs)
  const difference = now - before
  const sign = difference < 0 ? '-' : '+'
  const change = `${sign}${milliseconds(Math.abs(difference))} ms`
  return before === 0
    ? `${change} (${NOT_AVAILABLE})`
    : `${change} (${milliseconds(roundedToStep(now / before))}x)`
}

/** The baseline's median and 95th percentile, joined by a slash; "not measured" without a baseline. */
function baseCell(baseline: TimingSummary | undefined): string {
  return baseline === undefined
    ? NOT_MEASURED
    : [baseline.medianMs, baseline.p95Ms].map(milliseconds).join(MEDIAN_P95_SEPARATOR)
}

function formatRow(row: TimingRow, labelWidth: number): string {
  return [
    row.label.padEnd(labelWidth),
    row.budget.padStart(BUDGET_WIDTH),
    milliseconds(row.current.medianMs).padStart(TIME_WIDTH),
    milliseconds(row.current.p95Ms).padStart(TIME_WIDTH),
    baseCell(row.baseline).padStart(BASE_WIDTH),
    changeCell(row.current, row.baseline),
  ].join(COLUMN_GAP)
}

function formatTable(run: TimingRun, baseline: TimingRun | undefined): string[] {
  const rows = timingRows(run, baseline)
  const labelWidth = Math.max('Time'.length, ...rows.map((row) => row.label.length))
  const heading = [
    'Time'.padEnd(labelWidth),
    'Budget'.padStart(BUDGET_WIDTH),
    'Median'.padStart(TIME_WIDTH),
    'p95'.padStart(TIME_WIDTH),
    BASE_HEADING.padStart(BASE_WIDTH),
    'Change',
  ].join(COLUMN_GAP)
  return [heading, ...rows.map((row) => formatRow(row, labelWidth))]
}

/** Breaks the text over lines of at most the line width; later lines are indented like the prefix. */
function wrapped(prefix: string, text: string): string[] {
  const indent = ' '.repeat(prefix.length)
  const lines: string[] = []
  let line = prefix
  let hasWord = false
  for (const word of text.split(' ')) {
    const candidate = hasWord ? `${line} ${word}` : `${line}${word}`
    if (hasWord && candidate.length > LINE_WIDTH) {
      lines.push(line)
      line = `${indent}${word}`
    } else {
      line = candidate
    }
    hasWord = true
  }
  return [...lines, line]
}

function baseMachineText({ machine }: TimingRun): string {
  return `${machine.processor}; WebGPU ${machine.webGpuAdapter}; ${machine.operatingSystem}; ${machine.browser}`
}

function baseMachineField(baseline: TimingRun | undefined): [string, string][] {
  return baseline === undefined ? [] : [['Base machine', baseMachineText(baseline)]]
}

/** The labelled fields of the report header, in print order, before the base machine. */
function headerFields(run: TimingRun, baseline: TimingRun | undefined): [string, string][] {
  const { machine, conditions } = run
  const baselineText =
    baseline === undefined
      ? `${NOT_MEASURED} (no baseline yet)`
      : `commit ${baseline.commit.slice(0, COMMIT_LENGTH)}, taken ${baseline.takenAt}`
  return [
    [
      'Commit',
      `${run.commit.slice(0, COMMIT_LENGTH)}, uncommitted changes: ` +
        `${run.uncommittedChanges ? 'yes' : 'no'}.  Taken ${run.takenAt}`,
    ],
    ['Build', `${run.build.mode}, timer resolution ${run.build.timerResolutionMs} ms`],
    [
      'Machine',
      `${machine.processor}, ${machine.logicalCores} logical cores, ${machine.memoryGiB} GiB, ` +
        machine.operatingSystem,
    ],
    ['Browser', `${machine.browser}, headed`],
    ['Adapter', `hardware; WebGPU ${machine.webGpuAdapter}; WebGL ${machine.webGlRenderer}`],
    [
      'Display',
      `device pixel ratio ${conditions.devicePixelRatio}, a frame every ${conditions.displayFrameMs} ms`,
    ],
    [
      'Window',
      `visible throughout: ${conditions.visibleThroughout ? 'yes' : 'no'}, ` +
        `focused: ${conditions.focused ? 'yes' : 'no'}, power: ${conditions.power}`,
    ],
    [
      'Canvas',
      `plan ${sizeText(conditions.planCanvasPx)}; 3D ${sizeText(conditions.sceneCanvasCssPx)} ` +
        `CSS px, drawing buffer ${sizeText(conditions.sceneDrawingBufferPx)}`,
    ],
    ['Baseline', baselineText],
  ]
}

function headerLines(run: TimingRun, baseline: TimingRun | undefined): string[] {
  return [...headerFields(run, baseline), ...baseMachineField(baseline)].flatMap(([label, text]) =>
    wrapped(label.padEnd(HEADER_LABEL_WIDTH), text),
  )
}

/** The terminal report that ADR-0186 describes: header, one row per time, footnotes, warnings. */
export function formatTimingReport(current: TimingRun, baseline: TimingRun | undefined): string {
  const warnPrefix = 'Warning: '
  const lines = [
    'Vernacular timing report. Times are reported, never gated (ADR-0186).',
    ...(current.quick ? ['Quick check, not a measurement.'] : []),
    ...headerLines(current, baseline),
    '',
    ...formatTable(current, baseline),
    PLAN_BUDGET_NOTE,
    UNMEASURED_LINE,
    ...wrapped('', FRAME_NOTE),
    ...comparisonWarnings(current, baseline).flatMap((text) => wrapped(warnPrefix, text)),
  ]
  return `${lines.join('\n')}\n`
}
