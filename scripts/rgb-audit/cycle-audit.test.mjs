import { describe, expect, it } from 'vitest'
import { parseGitLog } from './cycle-audit.mjs'

const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

function record({ sha, subject, infra = '', files = [] }) {
  const header = [sha, subject, infra].join(FIELD_SEPARATOR)
  return [header, ...files].join('\n')
}

function gitLog(records) {
  return records.map(record).join(RECORD_SEPARATOR)
}

describe('parseGitLog', () => {
  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('parses a multi-record sample into structured commit objects', () => {
    const raw = gitLog([
      {
        sha: 'aaa1111',
        subject: 'test: pin the widget',
        files: ['core/widget.test.ts'],
      },
      {
        sha: 'bbb2222',
        subject: 'feat(widget): add the widget',
        files: ['core/widget.ts'],
      },
      {
        sha: 'ccc3333',
        subject: 'chore: tidy build',
        infra: 'build wiring',
        files: ['package.json'],
      },
    ])

    expect(parseGitLog(raw)).toEqual([
      {
        sha: 'aaa1111',
        type: 'test',
        scope: '',
        subject: 'pin the widget',
        files: ['core/widget.test.ts'],
        infra: false,
      },
      {
        sha: 'bbb2222',
        type: 'feat',
        scope: 'widget',
        subject: 'add the widget',
        files: ['core/widget.ts'],
        infra: false,
      },
      {
        sha: 'ccc3333',
        type: 'chore',
        scope: '',
        subject: 'tidy build',
        files: ['package.json'],
        infra: true,
      },
    ])
  })

  it('keeps an unparseable subject as the raw line with empty type and scope', () => {
    const raw = gitLog([
      {
        sha: 'ddd4444',
        subject: 'not a conventional subject',
        files: ['README.md'],
      },
    ])

    expect(parseGitLog(raw)).toEqual([
      {
        sha: 'ddd4444',
        type: '',
        scope: '',
        subject: 'not a conventional subject',
        files: ['README.md'],
        infra: false,
      },
    ])
  })
})
