import { describe, expect, it } from 'vitest'
import { parseCommitLog } from './git-input.mjs'

describe('parseCommitLog', () => {
  it('returns no commits for empty output', () => {
    expect(parseCommitLog('')).toEqual([])
  })

  it('reads sha, author, subject, and the full message of each record', () => {
    const raw =
      '\x1eaaa\x1fDan Moore\x1f9156191+drmrd@users.noreply.github.com\x1ffeat: add x\n\nBody line\nInfrastructure: glue\n' +
      '\n\x1ebbb\x1fdependabot[bot]\x1f49699333+dependabot[bot]@users.noreply.github.com\x1fbuild(deps): bump y\n'
    expect(parseCommitLog(raw)).toEqual([
      {
        sha: 'aaa',
        authorName: 'Dan Moore',
        authorEmail: '9156191+drmrd@users.noreply.github.com',
        subject: 'feat: add x',
        message: 'feat: add x\n\nBody line\nInfrastructure: glue',
      },
      {
        sha: 'bbb',
        authorName: 'dependabot[bot]',
        authorEmail: '49699333+dependabot[bot]@users.noreply.github.com',
        subject: 'build(deps): bump y',
        message: 'build(deps): bump y',
      },
    ])
  })
})
