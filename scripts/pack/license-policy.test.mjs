import { describe, expect, it } from 'vitest'
import { RECOGNIZED_LICENSES, recognize } from './license-policy.mjs'

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
