import { describe, expect, it } from 'vitest'

import { DEFAULT_GRADE_ELEVATION_MM, resolveGradeElevation, type Site } from './site'

describe('resolveGradeElevation', () => {
  it('returns the site grade elevation when present', () => {
    const site: Site = { gradeElevation: -600 }
    expect(resolveGradeElevation(site)).toBe(-600)
  })

  it('falls back to the datum when grade is absent', () => {
    expect(resolveGradeElevation({})).toBe(DEFAULT_GRADE_ELEVATION_MM)
  })

  it('falls back to the datum when the site is absent', () => {
    expect(resolveGradeElevation(undefined)).toBe(DEFAULT_GRADE_ELEVATION_MM)
  })
})
