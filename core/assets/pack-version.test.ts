import { describe, expect, it } from 'vitest'
import { comparePackVersions } from './pack-version.ts'

const SEMVER_SECTION_ELEVEN_CHAIN = [
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-alpha.beta',
  '1.0.0-beta',
  '1.0.0-beta.2',
  '1.0.0-beta.11',
  '1.0.0-rc.1',
  '1.0.0',
]

const NUMERIC_CHAIN = ['1.0.0', '1.1.0', '1.10.0', '2.0.0']

function adjacentPairs(chain: string[]): [string, string][] {
  return chain.flatMap((earlier, index): [string, string][] => {
    const later = chain[index + 1]
    return later === undefined ? [] : [[earlier, later]]
  })
}

describe('comparePackVersions', () => {
  it('orders versions by Semantic Versioning 2.0.0 precedence', () => {
    for (const [earlier, later] of [
      ...adjacentPairs(NUMERIC_CHAIN),
      ...adjacentPairs(SEMVER_SECTION_ELEVEN_CHAIN),
      ['1.99.99', '2.0.0'] as [string, string],
    ]) {
      expect(Math.sign(comparePackVersions(earlier, later)), `${earlier} < ${later}`).toBe(-1)
      expect(Math.sign(comparePackVersions(later, earlier)), `${later} > ${earlier}`).toBe(1)
    }

    expect(comparePackVersions('1.0.0', '1.0.0')).toBe(0)
    expect(comparePackVersions('1.0.0+build', '1.0.0')).toBe(0)

    const sorted = ['1.10.0', '1.0.0', '1.1.0', '1.0.0-beta'].sort(comparePackVersions)
    expect(sorted).toEqual(['1.0.0-beta', '1.0.0', '1.1.0', '1.10.0'])
  })

  it('compares numbers above the safe integer range as digit strings', () => {
    const beyondSafe = '9007199254740992'
    const nextBeyondSafe = '9007199254740993'

    expect(Math.sign(comparePackVersions(`1.0.0-${beyondSafe}`, `1.0.0-${nextBeyondSafe}`))).toBe(
      -1,
    )
    expect(Math.sign(comparePackVersions(`1.0.0-${nextBeyondSafe}`, `1.0.0-${beyondSafe}`))).toBe(1)
    expect(Math.sign(comparePackVersions(`${beyondSafe}.0.0`, `${nextBeyondSafe}.0.0`))).toBe(-1)
    expect(Math.sign(comparePackVersions(`${nextBeyondSafe}.0.0`, `${beyondSafe}.0.0`))).toBe(1)
  })

  it('compares numeric prerelease identifiers by value, not text', () => {
    expect(Math.sign(comparePackVersions('1.0.0-2', '1.0.0-10'))).toBe(-1)
    expect(Math.sign(comparePackVersions('1.0.0-10', '1.0.0-2'))).toBe(1)
  })

  it('sorts numeric prerelease identifiers before alphanumeric ones', () => {
    expect(Math.sign(comparePackVersions('1.0.0-1', '1.0.0-a'))).toBe(-1)
    expect(Math.sign(comparePackVersions('1.0.0-a', '1.0.0-1'))).toBe(1)
  })

  it('treats identifiers that mix digits and letters as alphanumeric text', () => {
    expect(Math.sign(comparePackVersions('1.0.0-1', '1.0.0-1a'))).toBe(-1)
    expect(Math.sign(comparePackVersions('1.0.0-1a', '1.0.0-a1'))).toBe(-1)
    expect(Math.sign(comparePackVersions('1.0.0-a1', '1.0.0-1a'))).toBe(1)
  })

  it('compares alphanumeric prerelease identifiers as text', () => {
    expect(comparePackVersions('1.0.0-alpha', '1.0.0-alpha')).toBe(0)
    expect(Math.sign(comparePackVersions('1.0.0-beta', '1.0.0-alpha'))).toBe(1)
    expect(Math.sign(comparePackVersions('1.0.0-alpha', '1.0.0-beta'))).toBe(-1)
  })
})
