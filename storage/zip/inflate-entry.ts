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

/**
 * Feeds the stream to one streaming inflater in slices and stops after the first slice whose
 * output passes the declared size, so a stream that lies about its size costs at most one slice.
 */
function inflateDeflated(entry: EntryData): InflatedEntry {
  const { data, declaredBytes } = entry
  const progress = { produced: 0 }
  try {
    const output = new Uint8Array(declaredBytes)
    const inflater = new Inflate((chunk) => {
      if (progress.produced + chunk.length <= output.length) output.set(chunk, progress.produced)
      progress.produced += chunk.length
    })
    for (let start = 0; start < data.length; start += INFLATE_SLICE_BYTES) {
      const end = Math.min(start + INFLATE_SLICE_BYTES, data.length)
      inflater.push(data.subarray(start, end), end === data.length)
      if (progress.produced > declaredBytes) {
        return refusal('passes-declared-size', progress.produced)
      }
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
