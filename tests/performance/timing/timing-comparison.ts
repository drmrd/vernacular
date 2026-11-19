import { sizeText, type TimingRun } from './timing-record'

interface Comparison {
  what: string
  now: string
  before: string
}

function conditionComparisons(current: TimingRun, baseline: TimingRun): Comparison[] {
  return [
    {
      what: 'device pixel ratio',
      now: String(current.conditions.devicePixelRatio),
      before: String(baseline.conditions.devicePixelRatio),
    },
    {
      what: 'drawing buffer size',
      now: sizeText(current.conditions.sceneDrawingBufferPx),
      before: sizeText(baseline.conditions.sceneDrawingBufferPx),
    },
    {
      what: 'plan canvas size',
      now: sizeText(current.conditions.planCanvasPx),
      before: sizeText(baseline.conditions.planCanvasPx),
    },
    {
      what: 'CSS size of the 3D canvas',
      now: sizeText(current.conditions.sceneCanvasCssPx),
      before: sizeText(baseline.conditions.sceneCanvasCssPx),
    },
  ]
}

function machineComparisons(current: TimingRun, baseline: TimingRun): Comparison[] {
  return [
    { what: 'browser', now: current.machine.browser, before: baseline.machine.browser },
    {
      what: 'adapter',
      now: current.machine.webGpuAdapter,
      before: baseline.machine.webGpuAdapter,
    },
    { what: 'processor', now: current.machine.processor, before: baseline.machine.processor },
    {
      what: 'operating system',
      now: current.machine.operatingSystem,
      before: baseline.machine.operatingSystem,
    },
  ]
}

function differenceWarnings(current: TimingRun, baseline: TimingRun | undefined): string[] {
  if (baseline === undefined) return []
  return [...conditionComparisons(current, baseline), ...machineComparisons(current, baseline)]
    .filter(({ now, before }) => now !== before)
    .map(
      ({ what, now, before }) =>
        `The ${what} differs: this run has ${now}, the baseline ${before}.`,
    )
}

function quickWarnings(current: TimingRun, baseline: TimingRun | undefined): string[] {
  const baselineIsQuick = baseline?.quick === true
  if (current.quick && baselineIsQuick) {
    return ['This run and the baseline are quick checks, not measurements.']
  }
  if (current.quick) return ['This run is a quick check, not a measurement.']
  return baselineIsQuick ? ['The baseline is a quick check, not a measurement.'] : []
}

function conditionWarnings(current: TimingRun): string[] {
  const { power, focused } = current.conditions
  const warnings: string[] = []
  if (power === 'battery') warnings.push('The computer ran on battery power.')
  if (power === 'unknown') warnings.push('The power source is unknown.')
  if (current.uncommittedChanges) warnings.push('The run has uncommitted changes.')
  if (!focused) warnings.push('The window was not focused.')
  return warnings
}

/** The warnings that ADR-0186 lists: they compare the two runs, or the current run carries them alone. */
export function comparisonWarnings(current: TimingRun, baseline: TimingRun | undefined): string[] {
  return [
    ...differenceWarnings(current, baseline),
    ...quickWarnings(current, baseline),
    ...conditionWarnings(current),
  ]
}
