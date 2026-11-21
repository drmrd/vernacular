import { describe, expect, it } from 'vitest'
import { milestoneCodeFindings } from './milestone-codes.mjs'

/** @param {string} subject @param {string} sha */
function commitWith(subject, sha) {
  return {
    sha,
    authorName: 'Dan Moore',
    authorEmail: '9156191+drmrd@users.noreply.github.com',
    subject,
    message: subject,
  }
}

/** @param {string[]} subjects */
function commitsFor(subjects) {
  return subjects.map((subject, index) => commitWith(subject, `sha${index}`))
}

describe('milestoneCodeFindings', () => {
  it('warns about a short code or a numbered phase in a subject', () => {
    const subjects = ['feat: finish M3 walls', 'docs: plan for slice 2', 'fix: close wave A']
    const commits = commitsFor(subjects)
    const findings = milestoneCodeFindings(commits, '')
    expect(findings).toHaveLength(subjects.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('milestone-code')
      expect(finding.sha).toBe(commits[index].sha)
    })
  })

  it('leaves ADR numbers, versions, and ordinary words alone', () => {
    const subjects = [
      'docs: record ADR-0221',
      'build: bump to 4.1.10',
      'feat: WebGL2 fallback',
      'fix: H.264 note',
      'docs: tick the executed steps',
      'feat: stage a change for review',
    ]
    expect(milestoneCodeFindings(commitsFor(subjects), '')).toEqual([])
  })

  it('warns about a code in the branch name', () => {
    for (const branch of ['feat/m3-walls', 'fix/lane-5-fade']) {
      const findings = milestoneCodeFindings([], branch)
      expect(findings).toHaveLength(1)
      expect(findings[0].rule).toBe('milestone-code')
      expect(findings[0]).not.toHaveProperty('sha')
    }
  })

  it('warns about a phase word followed by a letter in the branch name', () => {
    const findings = milestoneCodeFindings([], 'feat/wave-a')
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('milestone-code')
    expect(findings[0]).not.toHaveProperty('sha')
  })

  it('reports one finding per offending subject and one for the branch', () => {
    const commits = commitsFor(['feat: M3 lane 5', 'docs: plain words', 'fix: wave A'])
    const findings = milestoneCodeFindings(commits, 'feat/m3-lane-5')
    expect(findings).toHaveLength(3)
    const withSha = findings.filter((finding) => 'sha' in finding)
    expect(withSha.map((finding) => finding.sha)).toEqual([commits[0].sha, commits[2].sha])
    expect(findings.filter((finding) => !('sha' in finding))).toHaveLength(1)
  })

  it('quotes the branch text as written', () => {
    for (const [branch, written] of [
      ['feat/lane_5', 'lane_5'],
      ['feat/stage.2', 'stage.2'],
    ]) {
      const findings = milestoneCodeFindings([], branch)
      expect(findings).toHaveLength(1)
      expect(findings[0].message).toContain(`milestone code "${written}"`)
    }
  })

  it('leaves a plain branch name alone', () => {
    for (const branch of ['build/vitest-browser-4-1-10', 'feat/policy-checks-in-ci']) {
      expect(milestoneCodeFindings([], branch)).toEqual([])
    }
  })
})
