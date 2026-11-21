import { describe, expect, it } from 'vitest'
import { trailerFindings } from './commit-rules.mjs'

/** @param {string} sha @param {string} message */
function commitWith(sha, message) {
  return {
    sha,
    authorName: 'Dan Moore',
    authorEmail: '9156191+drmrd@users.noreply.github.com',
    subject: message.split('\n')[0],
    message,
  }
}

describe('trailerFindings', () => {
  it('refuses a Co-Authored-By trailer in any letter case', () => {
    const commit = commitWith('aaa', 'feat: add x\n\nCo-authored-by: X <x@y>')
    const findings = trailerFindings([commit])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'forbidden-trailer', sha: 'aaa' })
  })

  it('refuses AI-session trailers such as Claude-Session', () => {
    const commit = commitWith(
      'bbb',
      'feat: add x\n\nClaude-Session: https://example.com/session/1\nAI-Session: 1',
    )
    const findings = trailerFindings([commit])
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.rule === 'forbidden-trailer' && f.sha === 'bbb')).toBe(true)
  })

  it('refuses a generated-with footer line', () => {
    const commit = commitWith(
      'ccc',
      'feat: add x\n\nGenerated with [Claude Code](https://example.com/code)',
    )
    const findings = trailerFindings([commit])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'forbidden-trailer', sha: 'ccc' })
  })

  it('refuses upper-case and lower-case trailer keys', () => {
    const upper = commitWith('eee', 'feat: add x\n\nCO-AUTHORED-BY: X <x@y>')
    const lower = commitWith('fff', 'feat: add x\n\nclaude-session: 1')
    const findings = trailerFindings([upper, lower])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => [f.rule, f.sha])).toEqual([
      ['forbidden-trailer', 'eee'],
      ['forbidden-trailer', 'fff'],
    ])
  })

  it('refuses Generated-by and Assisted-by trailers, one finding each', () => {
    const generated = commitWith('ggg', 'feat: add x\n\nGenerated-by: a tool')
    const assisted = commitWith('hhh', 'feat: add x\n\nAssisted-by: a tool')
    const findings = trailerFindings([generated, assisted])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => [f.rule, f.sha])).toEqual([
      ['forbidden-trailer', 'ggg'],
      ['forbidden-trailer', 'hhh'],
    ])
  })

  it('refuses a trailer key preceded by leading spaces', () => {
    const commit = commitWith('iii', 'feat: add x\n\n   Co-authored-by: X <x@y>')
    const findings = trailerFindings([commit])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'forbidden-trailer', sha: 'iii' })
  })

  it('refuses a generated-with footer in the middle of a line and in any letter case', () => {
    const middle = commitWith('jjj', 'feat: add x\n\nFooter: Generated with [Claude Code] today')
    const mixed = commitWith('kkk', 'feat: add x\n\nGENERATED WITH [CLAUDE CODE]')
    const findings = trailerFindings([middle, mixed])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => [f.rule, f.sha])).toEqual([
      ['forbidden-trailer', 'jjj'],
      ['forbidden-trailer', 'kkk'],
    ])
  })

  it('reports one finding per offending line, each with the commit sha', () => {
    const commit = commitWith('lll', 'feat: add x\n\nCo-authored-by: X <x@y>\nGenerated-by: a tool')
    const findings = trailerFindings([commit])
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.rule === 'forbidden-trailer' && f.sha === 'lll')).toBe(true)
  })

  it('accepts the Infrastructure and Signed-off-by trailers and session words in prose', () => {
    const commit = commitWith(
      'ddd',
      [
        'build(deps): bump y',
        '',
        'Infrastructure: glue',
        'Signed-off-by: dependabot[bot] <support@github.com>',
        'the editor session: kept',
        'Session: plain',
      ].join('\n'),
    )
    expect(trailerFindings([commit])).toEqual([])
  })
})
