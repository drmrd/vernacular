import { describe, expect, it } from 'vitest'
import { RECOGNIZED_LICENSES, isShareAlike, recognize } from './license-policy.mjs'

describe('recognize', () => {
  it('accepts every curated open license', () => {
    for (const id of RECOGNIZED_LICENSES) {
      expect(recognize(id)).toBe(true)
    }
  })

  it('rejects an unknown identifier', () => {
    expect(recognize('Weird-1.0')).toBe(false)
  })

  it('curates at least the core redistribution-friendly licenses', () => {
    for (const id of ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0']) {
      expect(RECOGNIZED_LICENSES).toContain(id)
    }
  })
})

describe('isShareAlike', () => {
  it('flags share-alike licenses', () => {
    for (const id of ['CC-BY-SA-4.0', 'CC-BY-SA-3.0']) {
      expect(isShareAlike(id)).toBe(true)
    }
  })

  it('does not flag licenses without share-alike terms', () => {
    for (const id of ['CC-BY-4.0', 'MIT', 'CC0-1.0']) {
      expect(isShareAlike(id)).toBe(false)
    }
  })
})
