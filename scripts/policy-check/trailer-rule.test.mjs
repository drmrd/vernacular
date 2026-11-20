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
