// @vitest-environment node
// Pure inflation logic; node aligns Uint8Array realms with fflate.
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { inflateEntry, INFLATE_SLICE_BYTES, type InflateRefusal } from './inflate-entry'
import { seededBytes } from './zip-test-kit'

const STORED = 0
const DEFLATED = 8
/** The largest ratio of DEFLATE: a stream cannot grow by more (IN2). */
const LARGEST_RATIO = 1032
const CONTENT = new TextEncoder().encode('a parlor, a hall, a kitchen, and a porch; '.repeat(40))
const STREAM = deflateSync(CONTENT)
/** TK2: fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(64).fill(0xff)
/** A stream of stored blocks, about as long as its content, that spans 33 slices (TK1). */
const LONG_CONTENT = seededBytes(2 * 1024 * 1024)
const LONG_STREAM = deflateSync(LONG_CONTENT, { level: 0 })

function refused(reason: InflateRefusal) {
  return { ok: false, reason, inflatedBytes: 0 }
}

describe('inflateEntry gives the content of a sound entry', () => {
  it.each<[string, Uint8Array]>([
    ['a short entry', CONTENT],
    ['an entry of many slices', seededBytes(200_000)],
  ])('gives the content of a deflated entry of the declared size: %s', (_case, content) => {
    const data = deflateSync(content)

    expect(inflateEntry({ data, method: DEFLATED, declaredBytes: content.length })).toEqual({
      ok: true,
      bytes: content,
    })
  })

  it('gives the bytes of a stored entry as a view of its data (IN1)', () => {
    const holder = new Uint8Array(CONTENT.length + 20)
    holder.set(CONTENT, 10)
    const data = holder.subarray(10, 10 + CONTENT.length)

    const result = inflateEntry({ data, method: STORED, declaredBytes: data.length })

    expect(result).toEqual({ ok: true, bytes: CONTENT })
    const bytes = result.ok ? result.bytes : new Uint8Array(0)
    expect(bytes.buffer).toBe(holder.buffer)
    expect(bytes.byteOffset).toBe(10)
    expect(bytes.length).toBe(CONTENT.length)
  })

  it('an empty stream is an empty entry only for a declared size of 0 (IN8)', () => {
    const data = new Uint8Array(0)

    expect(inflateEntry({ data, method: DEFLATED, declaredBytes: 0 })).toEqual({
      ok: true,
      bytes: new Uint8Array(0),
    })
    expect(inflateEntry({ data, method: DEFLATED, declaredBytes: 1 })).toEqual(
      refused('shorter-than-declared'),
    )
  })
})

describe('inflateEntry refuses an entry that does not match its declared size', () => {
  it.each<[number, InflateRefusal]>([
    [CONTENT.length - 1, 'passes-declared-size'],
    [CONTENT.length + 1, 'shorter-than-declared'],
  ])(
    'a stored entry longer or shorter than it declares is refused (IN1): declared %i',
    (declaredBytes, reason) => {
      expect(inflateEntry({ data: CONTENT, method: STORED, declaredBytes })).toEqual(
        refused(reason),
      )
    },
  )

  it.each([10, 1_000_000])(
    'feeds at most one slice after the declared size is reached (IN3, IN4): declared %i',
    (declaredBytes) => {
      const result = inflateEntry({ data: LONG_STREAM, method: DEFLATED, declaredBytes })

      expect(result).toMatchObject({ ok: false, reason: 'passes-declared-size' })
      const count = result.ok ? Number.NaN : result.inflatedBytes
      expect(count).toBeGreaterThan(declaredBytes)
      expect(count).toBeLessThan(declaredBytes + 2 * INFLATE_SLICE_BYTES)
    },
  )

  it('a stream that gives fewer bytes than declared is shorter-than-declared (IN5)', () => {
    const declaredBytes = CONTENT.length + 1

    expect(inflateEntry({ data: STREAM, method: DEFLATED, declaredBytes })).toMatchObject({
      ok: false,
      reason: 'shorter-than-declared',
    })
  })

  it('a declared size above 1,032 times the stream is refused with nothing inflated (IN2)', () => {
    const bound = LARGEST_RATIO * GARBAGE.length
    const declaring = (declaredBytes: number) =>
      inflateEntry({ data: GARBAGE, method: DEFLATED, declaredBytes })

    expect(declaring(bound + 1)).toEqual(refused('shorter-than-declared'))
    expect(declaring(2 ** 40)).toEqual(refused('shorter-than-declared'))
    expect(declaring(bound)).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})

describe('inflateEntry refuses an entry it cannot inflate', () => {
  it.each<[string, Uint8Array]>([
    ['a stream that ends early', STREAM.slice(0, Math.floor(STREAM.length / 2))],
    ['bytes that are no stream', GARBAGE],
  ])(
    'a stream that ends early, and bytes that are no stream, are corrupt (IN6): %s',
    (_case, data) => {
      expect(inflateEntry({ data, method: DEFLATED, declaredBytes: CONTENT.length })).toMatchObject(
        {
          ok: false,
          reason: 'corrupt',
        },
      )
    },
  )

  it.each([1, 9, 12, 99])('another method is unsupported-method (IN7): method %i', (method) => {
    expect(inflateEntry({ data: STREAM, method, declaredBytes: CONTENT.length })).toEqual(
      refused('unsupported-method'),
    )
  })
})
