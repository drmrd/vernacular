import { describe, expect, it } from 'vitest'
import {
  RECOGNIZED_LICENSES,
  isNoRedistribution,
  isShareAlike,
  licenseProblems,
  recognize,
  shareAlikeWarning,
} from './license-policy.mjs'

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

describe('isNoRedistribution', () => {
  it('flags non-redistributable licenses', () => {
    for (const id of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0']) {
      expect(isNoRedistribution(id)).toBe(true)
    }
  })

  it('does not flag redistribution-friendly licenses', () => {
    for (const id of ['CC0-1.0', 'CC-BY-SA-4.0']) {
      expect(isNoRedistribution(id)).toBe(false)
    }
  })
})

describe('licenseProblems', () => {
  it('reports no problems for a recognized open license', () => {
    expect(licenseProblems('CC0-1.0')).toEqual([])
  })

  it('reports one problem for an unrecognized license', () => {
    const problems = licenseProblems('Weird-1.0')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not a recognized')
  })

  it('reports one problem for a no-redistribution license', () => {
    const problems = licenseProblems('CC-BY-NC-4.0')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('forbids redistribution')
  })
})

describe('shareAlikeWarning', () => {
  it('warns when a share-alike license mixes with a different license', () => {
    const warning = shareAlikeWarning(['CC-BY-SA-4.0', 'CC0-1.0'])
    expect(typeof warning).toBe('string')
    expect(warning).toContain('share-alike')
  })

  it('does not warn when no share-alike license is present', () => {
    expect(shareAlikeWarning(['CC0-1.0', 'MIT'])).toBeNull()
  })

  it('does not warn when only a single distinct share-alike license is used', () => {
    expect(shareAlikeWarning(['CC-BY-SA-4.0', 'CC-BY-SA-4.0'])).toBeNull()
  })
})
