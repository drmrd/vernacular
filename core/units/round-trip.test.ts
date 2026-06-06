import { describe, expect, it } from 'vitest'
import { formatLength, type FormatLengthOptions } from './format-length'
import { parseLength } from './parse-length'
import { MM_PER_CENTIMETER, MM_PER_FOOT, MM_PER_INCH, MM_PER_METER } from './length-units'

/**
 * Seed for the deterministic value generator. Logged here (and in any failure
 * message) so a failing case reproduces exactly: rerun with the same seed to
 * regenerate the identical sequence of millimeter values.
 */
const SEED = 0x5eed_1234

/**
 * mulberry32: a tiny, fast, fully deterministic 32-bit PRNG. Seeding it with
 * the same value always yields the same sequence, which is what lets a failing
 * round-trip case be reproduced rather than vanish on the next run.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The deterministic value set for a single case. A fresh generator is created
 * per case from the same SEED, so every case sees the identical sequence and a
 * failure pins to a stable (case, value) pair. The three explicit boundaries
 * (zero, a fixed positive, a fixed negative) always run.
 */
function caseValues(): number[] {
  const random = mulberry32(SEED)
  const values: number[] = [0, 2032, -2438.4]
  for (let i = 0; i < 150; i += 1) {
    values.push(random() * 10000 - 5000)
  }
  return values
}

interface RoundTripCase {
  readonly label: string
  readonly options: FormatLengthOptions
  readonly quantumMm: number
}

const CASES: readonly RoundTripCase[] = [
  ...[0, 1, 2, 3].map((places) => ({
    label: `metric meters at ${places} decimal places`,
    options: {
      system: 'metric' as const,
      form: 'meters' as const,
      precision: { kind: 'decimal-places' as const, places },
    },
    quantumMm: 10 ** -places * MM_PER_METER,
  })),
  ...[0, 1].map((places) => ({
    label: `metric centimeters at ${places} decimal places`,
    options: {
      system: 'metric' as const,
      form: 'centimeters' as const,
      precision: { kind: 'decimal-places' as const, places },
    },
    quantumMm: 10 ** -places * MM_PER_CENTIMETER,
  })),
  {
    label: 'metric millimeters at 0 decimal places',
    options: {
      system: 'metric' as const,
      form: 'millimeters' as const,
      precision: { kind: 'decimal-places' as const, places: 0 },
    },
    quantumMm: 1,
  },
  ...[0, 1, 2, 3].map((places) => ({
    label: `imperial decimal-feet at ${places} decimal places`,
    options: {
      system: 'imperial' as const,
      form: 'decimal-feet' as const,
      precision: { kind: 'decimal-places' as const, places },
    },
    quantumMm: 10 ** -places * MM_PER_FOOT,
  })),
  ...[0, 1, 2].map((places) => ({
    label: `imperial decimal-inches at ${places} decimal places`,
    options: {
      system: 'imperial' as const,
      form: 'decimal-inches' as const,
      precision: { kind: 'decimal-places' as const, places },
    },
    quantumMm: 10 ** -places * MM_PER_INCH,
  })),
  ...[0, 1, 2].map((places) => ({
    label: `imperial feet-and-inches at ${places} decimal places`,
    options: {
      system: 'imperial' as const,
      form: 'feet-and-inches' as const,
      precision: { kind: 'decimal-places' as const, places },
    },
    quantumMm: 10 ** -places * MM_PER_INCH,
  })),
  ...[2, 4, 8, 16].map((denominator) => ({
    label: `imperial feet-and-inches at fraction denominator ${denominator}`,
    options: {
      system: 'imperial' as const,
      form: 'feet-and-inches' as const,
      precision: { kind: 'fraction' as const, denominator },
    },
    quantumMm: MM_PER_INCH / denominator,
  })),
]

describe('formatLength / parseLength round-trip invariant', () => {
  for (const { label, options, quantumMm } of CASES) {
    it(`reformats to a fixpoint and stays within half a display quantum for ${label} (seed ${SEED})`, () => {
      const tolerance = quantumMm / 2 + 1e-6
      for (const x of caseValues()) {
        const s = formatLength(x, options)
        const x2 = parseLength(s)

        // (3) String fixpoint: reformatting the parsed value reproduces the
        // exact same display string. Asserted exactly with toBe.
        expect(
          formatLength(x2, options),
          `string fixpoint broke for ${label} at x=${x}: formatLength(x)=${JSON.stringify(
            s,
          )}, parseLength(s)=${x2}, formatLength(x2)=${JSON.stringify(
            formatLength(x2, options),
          )} (seed ${SEED})`,
        ).toBe(s)

        // (4) Numeric closeness: the parsed value stays within half a display
        // quantum of the original, plus a tiny epsilon for float fuzz.
        expect(
          Math.abs(x2 - x),
          `round-trip drift exceeded half a quantum for ${label} at x=${x}: s=${JSON.stringify(
            s,
          )}, x2=${x2}, |x2-x|=${Math.abs(x2 - x)}, allowed<=${tolerance} (seed ${SEED})`,
        ).toBeLessThanOrEqual(tolerance)
      }
    })
  }
})
