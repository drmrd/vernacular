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

const NO_BYTES = new Uint8Array(0)

/**
 * Feeds the stream to the inflater in slices. It stops after the first slice whose output passes
 * the declared size. Once the output equals the declared size, it feeds at most one more slice
 * and then ends the stream with an empty final push, so the bytes after the end of a stream are
 * never fed (fflate would copy all of them at each push).
 */
function feedSlices(inflater: Inflate, entry: EntryData, progress: { produced: number }): void {
  const { data, declaredBytes } = entry
  for (let start = 0; start < data.length; start += INFLATE_SLICE_BYTES) {
    const end = Math.min(start + INFLATE_SLICE_BYTES, data.length)
    const isLastSlice = end === data.length
    const outputWasComplete = start > 0 && progress.produced === declaredBytes
    inflater.push(data.subarray(start, end), isLastSlice)
    if (progress.produced > declaredBytes) return
    if (outputWasComplete && !isLastSlice) {
      inflater.push(NO_BYTES, true)
      return
    }
  }
}

/** Inflates a DEFLATE stream into a buffer of the declared size, in slices (IN3 to IN6). */
function inflateDeflated(entry: EntryData): InflatedEntry {
  const { declaredBytes } = entry
  const progress = { produced: 0 }
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
