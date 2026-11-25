import { describe, expect, it } from 'vitest'
import { isAllowedLicenseMove, mostPermissiveLicense } from './license-moves.ts'
import { RECOGNIZED_LICENSES } from './license-policy.ts'

describe('a license move may only grant more rights', () => {
  it.each([
    ['a license to itself', 'CC-BY-4.0', 'CC-BY-4.0'],
    ['CC-BY-4.0 to CC0-1.0', 'CC-BY-4.0', 'CC0-1.0'],
    ['MIT to CC0-1.0', 'MIT', 'CC0-1.0'],
    ['CC-BY-SA-4.0 to CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-4.0'],
    ['CC-BY-SA-3.0 to CC-BY-3.0', 'CC-BY-SA-3.0', 'CC-BY-3.0'],
  ])('allows %s', (_label, from, to) => {
    expect(isAllowedLicenseMove(from, to)).toBe(true)
  })

  it.each([
    ['CC0-1.0 to CC-BY-4.0', 'CC0-1.0', 'CC-BY-4.0'],
    ['CC-BY-SA-4.0 to CC-BY-3.0', 'CC-BY-SA-4.0', 'CC-BY-3.0'],
    ['CC-BY-4.0 to CC-BY-SA-4.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'],
    ['CC-BY-4.0 to MIT', 'CC-BY-4.0', 'MIT'],
    ['CC-BY-3.0 to CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-4.0'],
    ['an unknown license to CC0-1.0', 'LicenseRef-custom', 'CC0-1.0'],
  ])('refuses %s', (_label, from, to) => {
    expect(isAllowedLicenseMove(from, to)).toBe(false)
  })

  it.each(RECOGNIZED_LICENSES)('allows %s to CC0-1.0', (license) => {
    expect(isAllowedLicenseMove(license, 'CC0-1.0')).toBe(true)
  })
})

describe('the most permissive license of a set', () => {
  it('prefers an attribution license over a share-alike license', () => {
    expect(mostPermissiveLicense(['CC-BY-SA-4.0', 'CC-BY-4.0'])).toBe('CC-BY-4.0')
  })

  it('prefers a public-domain dedication over every other license', () => {
    expect(mostPermissiveLicense(['CC-BY-SA-4.0', 'CC-BY-4.0', 'CC0-1.0'])).toBe('CC0-1.0')
  })

  it('gives an empty string for an empty list', () => {
    expect(mostPermissiveLicense([])).toBe('')
  })

  it('gives the first license when the licenses are unrelated', () => {
    expect(mostPermissiveLicense(['MIT', 'CC-BY-4.0'])).toBe('MIT')
  })
})
