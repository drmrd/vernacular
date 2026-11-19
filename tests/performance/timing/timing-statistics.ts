/**
 * Declared here until the record module takes it over: the summary of one list of samples.
 */
export interface TimingSummary {
  samples: number
  medianMs: number
  p95Ms: number
}

const PERCENTILE_RANK = 0.95
const STEPS_PER_MS = 100 // rounds to 0.01 ms
const MIDDLE_PAIR_DIVISOR = 2

function roundedToStep(valueMs: number): number {
  return Math.round(valueMs * STEPS_PER_MS) / STEPS_PER_MS
}

function sampleAt(sortedMs: readonly number[], index: number): number {
  const sample = sortedMs[index]
  if (sample === undefined) throw new Error(`No sample at index ${index}`)
  return sample
}

function medianOfSorted(sortedMs: readonly number[]): number {
  const middle = Math.floor(sortedMs.length / MIDDLE_PAIR_DIVISOR)
  if (sortedMs.length % MIDDLE_PAIR_DIVISOR === 1) return sampleAt(sortedMs, middle)
  return (sampleAt(sortedMs, middle - 1) + sampleAt(sortedMs, middle)) / MIDDLE_PAIR_DIVISOR
}

function nearestRankPercentile(sortedMs: readonly number[], rank: number): number {
  return sampleAt(sortedMs, Math.ceil(rank * sortedMs.length) - 1)
}

/**
 * The median and the nearest-rank 95th percentile of the samples, in milliseconds rounded to
 * 0.01. The median of an even count is the mean of the two middle samples; the 95th percentile
 * is `sorted[ceil(0.95 n) - 1]`. The input is not mutated. Throws on an empty list or a sample
 * that is not a finite number of zero or more.
 */
export function summarizeSamples(samplesMs: readonly number[]): TimingSummary {
  if (samplesMs.length === 0) throw new Error('Cannot summarize an empty list of samples')
  for (const sample of samplesMs) {
    if (!Number.isFinite(sample) || sample < 0) {
      throw new Error(`A sample must be a finite number of zero or more, got ${sample}`)
    }
  }
  const sortedMs = [...samplesMs].sort((first, second) => first - second)
  return {
    samples: sortedMs.length,
    medianMs: roundedToStep(medianOfSorted(sortedMs)),
    p95Ms: roundedToStep(nearestRankPercentile(sortedMs, PERCENTILE_RANK)),
  }
}
