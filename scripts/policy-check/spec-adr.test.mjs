import { describe, expect, it } from 'vitest'
import { specNeedsAdrFindings } from './spec-adr.mjs'

/** @param {string} path @param {string} [status] */
function changed(path, status = 'M') {
  return { status, path }
}

const SPEC = 'docs/specs/2026-06-01-vernacular-design.md'
const ADR = 'docs/knowledge/decisions/ADR-0219-policy-checks-in-ci.md'

describe('specNeedsAdrFindings', () => {
  it('accepts a pull request without spec changes', () => {
    const files = [changed('src/main.ts'), changed('docs/plans/2026-11-19-x.md', 'A')]
    expect(specNeedsAdrFindings(files)).toEqual([])
  })

  it('refuses a spec change without an added or modified ADR', () => {
    const files = [changed(SPEC), changed('docs/specs/other.md', 'A')]
    const findings = specNeedsAdrFindings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('spec-needs-adr')
    expect(findings[0].file).toBe(SPEC)
    expect(findings[0].message).toContain(SPEC)
    expect(findings[0].message).toContain('docs/specs/other.md')
  })

  it('accepts a spec change with an added or a modified ADR', () => {
    expect(specNeedsAdrFindings([changed(SPEC), changed(ADR, 'A')])).toEqual([])
    expect(specNeedsAdrFindings([changed(SPEC), changed(ADR, 'M')])).toEqual([])
  })

  it('counts a spec moved out of docs/specs as a spec change', () => {
    const moved = { status: 'R', path: 'docs/archive/a.md', previousPath: 'docs/specs/a.md' }
    const findings = specNeedsAdrFindings([moved])
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('spec-needs-adr')
    expect(findings[0].message).toContain('docs/specs/a.md')
  })

  it('does not count a deleted ADR or a file outside decisions', () => {
    const files = [changed(SPEC), changed(ADR, 'D'), changed('docs/knowledge/INDEX.md', 'A')]
    const findings = specNeedsAdrFindings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe(SPEC)
  })
})
