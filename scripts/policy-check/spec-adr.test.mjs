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
    const files = [changed(SPEC), changed('docs/specs/other.md')]
    const findings = specNeedsAdrFindings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('spec-needs-adr')
    expect(findings[0].file).toBe(SPEC)
    expect(findings[0].message).toContain(SPEC)
    expect(findings[0].message).toContain('docs/specs/other.md')
  })

  it('accepts a newly added spec without an ADR', () => {
    const files = [changed('docs/specs/2026-11-20-new-topic.md', 'A'), changed('src/main.ts')]
    expect(specNeedsAdrFindings(files)).toEqual([])
  })

  it('still refuses a modified spec beside an added spec when no ADR changes', () => {
    const files = [changed('docs/specs/new.md', 'A'), changed(SPEC)]
    const findings = specNeedsAdrFindings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('spec-needs-adr')
    expect(findings[0].file).toBe(SPEC)
  })

  it('reports a finding with only the rule, the file, and a message', () => {
    const findings = specNeedsAdrFindings([changed(SPEC)])
    expect(findings[0]).toEqual({
      rule: 'spec-needs-adr',
      file: SPEC,
      message: expect.stringContaining(SPEC),
    })
  })

  it('accepts a renamed ADR as the explaining decision', () => {
    const renamed = changed('docs/knowledge/decisions/ADR-0219-x.md', 'R')
    expect(specNeedsAdrFindings([changed('docs/specs/x.md'), renamed])).toEqual([])
  })

  it.each([
    'docs/knowledge/decisions/sub/ADR-0001-x.md',
    'docs/knowledge/decisions/ADR-0001-x.png',
    'docs/knowledge/decisions/README.md',
  ])('does not count %s as an ADR', (path) => {
    const findings = specNeedsAdrFindings([changed('docs/specs/x.md'), changed(path, 'A')])
    expect(findings).toHaveLength(1)
  })

  it('counts a deleted spec as a spec change', () => {
    expect(specNeedsAdrFindings([changed('docs/specs/x.md', 'D')])).toHaveLength(1)
  })

  it('counts a file moved into docs/specs as a spec change', () => {
    const moved = { status: 'R', path: 'docs/specs/a.md', previousPath: 'docs/a.md' }
    expect(specNeedsAdrFindings([moved])).toHaveLength(1)
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
    expect(findings[0].file).toBe('docs/specs/a.md')
    expect(findings[0].message).toContain('docs/specs/a.md')
  })

  it('does not count a deleted ADR or a file outside decisions', () => {
    const files = [changed(SPEC), changed(ADR, 'D'), changed('docs/knowledge/INDEX.md', 'A')]
    const findings = specNeedsAdrFindings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe(SPEC)
  })
})
