import { Inflate } from 'fflate'

/** The bytes of the stream that one call of the inflater is given. */
export const INFLATE_SLICE_BYTES = 65_536

export interface EntryData {
  /** The bytes of the entry as the archive holds them. */
  readonly data: Uint8Array
  /** 0 stored, 8 deflate. */
  readonly method: number
  /** The size after inflation that the central directory declares (classic or ZIP64). */
  readonly declaredBytes: number
}

export type InflateRefusal =
  | 'passes-declared-size'
  | 'shorter-than-declared'
  | 'corrupt'
  | 'unsupported-method'

export type InflatedEntry =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: InflateRefusal; readonly inflatedBytes: number }

const STORED_METHOD = 0
const DEFLATE_METHOD = 8
/** No DEFLATE stream inflates to more than this many times its own length. */
const MAXIMUM_DEFLATE_RATIO = 1032

function refusal(reason: InflateRefusal, inflatedBytes: number): InflatedEntry {
  return { ok: false, reason, inflatedBytes }
}

function storedEntry(entry: EntryData): InflatedEntry {
  if (entry.data.length > entry.declaredBytes) return refusal('passes-declared-size', 0)
  if (entry.data.length < entry.declaredBytes) return refusal('shorter-than-declared', 0)
  return { ok: true, bytes: entry.data }
}

/** After this many slices in a row with no output, the next slice is the last one fed. */
const SLICES_WITHOUT_OUTPUT_BEFORE_THE_LAST = 2

interface InflateProgress {
  /** The bytes the inflater has produced, advanced by its callback. */
  produced: number
  /** The slices in a row, up to now, that gave no output, advanced by the slice loop. */
  slicesWithoutOutput: number
}

/**
 * Whether the slice at `start` is the last one fed, and so is pushed with `final` true. That is
 * the last slice of the data and, after at least one push, the slice that follows output equal to
 * the declared size or two slices in a row with no output.
 */
function isLastSliceToFeed(entry: EntryData, start: number, progress: InflateProgress): boolean {
  if (start + INFLATE_SLICE_BYTES >= entry.data.length) return true
  if (start === 0) return false
  return (
    progress.produced === entry.declaredBytes ||
    progress.slicesWithoutOutput >= SLICES_WITHOUT_OUTPUT_BEFORE_THE_LAST
  )
}

/**
 * Feeds the stream to the inflater in slices and stops after the first slice whose output passes
 * the declared size, or after the slice pushed with `final` true. The inflater's callback advances
 * `progress.produced`. At most one slice is fed after the output reaches the declared size, and at
 * most three slices after the last output, so the bytes after the end of a stream cost at most
 * that much (fflate keeps them and copies all of them at each push).
 */
function feedSlices(inflater: Inflate, entry: EntryData, progress: InflateProgress): void {
  const { data, declaredBytes } = entry
  for (let start = 0; start < data.length; start += INFLATE_SLICE_BYTES) {
    const isLastSlice = isLastSliceToFeed(entry, start, progress)
    const producedBefore = progress.produced
    inflater.push(data.subarray(start, start + INFLATE_SLICE_BYTES), isLastSlice)
    if (isLastSlice || progress.produced > declaredBytes) return
    const gaveOutput = progress.produced > producedBefore
    progress.slicesWithoutOutput = gaveOutput ? 0 : progress.slicesWithoutOutput + 1
  }
}

/** Inflates a DEFLATE stream into a buffer of the declared size, in slices. */
function inflateDeflated(entry: EntryData): InflatedEntry {
  const { declaredBytes } = entry
  const progress: InflateProgress = { produced: 0, slicesWithoutOutput: 0 }
  try {
    const output = new Uint8Array(declaredBytes)
    const inflater = new Inflate((chunk) => {
      if (progress.produced + chunk.length <= output.length) output.set(chunk, progress.produced)
      progress.produced += chunk.length
    })
    feedSlices(inflater, entry, progress)
    if (progress.produced > declaredBytes) {
      return refusal('passes-declared-size', progress.produced)
    }
    if (progress.produced < declaredBytes) {
      return refusal('shorter-than-declared', progress.produced)
    }
    return { ok: true, bytes: output }
  } catch {
    return refusal('corrupt', progress.produced)
  }
}

/** Inflates one entry within its declared size. Never throws. */
export function inflateEntry(entry: EntryData): InflatedEntry {
  if (entry.method === STORED_METHOD) return storedEntry(entry)
  if (entry.method !== DEFLATE_METHOD) return refusal('unsupported-method', 0)
  if (entry.declaredBytes > MAXIMUM_DEFLATE_RATIO * entry.data.length) {
    return refusal('shorter-than-declared', 0)
  }
  if (entry.data.length === 0) return { ok: true, bytes: new Uint8Array(0) }
  return inflateDeflated(entry)
}
