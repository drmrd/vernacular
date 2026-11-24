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
})
