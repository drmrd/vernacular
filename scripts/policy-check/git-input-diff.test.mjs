import { describe, expect, it } from 'vitest'
import { parseNameStatus, parseUnifiedDiff } from './git-input.mjs'

const diffOf = (...lines) => lines.join('\n') + '\n'

describe('parseUnifiedDiff', () => {
  it('numbers added lines by their line in the new file across two hunks', () => {
    const raw = diffOf(
      'diff --git a/docs/a.md b/docs/a.md',
      'index 1111111..2222222 100644',
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -3,0 +4,2 @@',
      '+one',
      '+two',
      '@@ -10 +12 @@',
      '-old',
      '+new',
    )
    expect(parseUnifiedDiff(raw)).toEqual([
      { file: 'docs/a.md', line: 4, text: 'one' },
      { file: 'docs/a.md', line: 5, text: 'two' },
      { file: 'docs/a.md', line: 12, text: 'new' },
    ])
  })

  it('reads an added line that starts with ++ as an added line, not a file header', () => {
    const raw = diffOf(
      'diff --git a/docs/a.md b/docs/a.md',
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -0,0 +1 @@',
      '+++ heading',
    )
    expect(parseUnifiedDiff(raw)).toEqual([{ file: 'docs/a.md', line: 1, text: '++ heading' }])
  })

  it('gives no added lines for a deleted file or a binary file', () => {
    const raw = diffOf(
      'diff --git a/old.md b/old.md',
      'deleted file mode 100644',
      '--- a/old.md',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-gone',
      '-also gone',
      'diff --git a/x.png b/x.png',
      'index 1111111..2222222 100644',
      'Binary files a/x.png and b/x.png differ',
    )
    expect(parseUnifiedDiff(raw)).toEqual([])
  })
})

describe('parseNameStatus', () => {
  it('reads modified, added, deleted, and renamed paths from name-status output', () => {
    const raw =
      'M\tpackage.json\nA\tdocs/knowledge/decisions/ADR-0300-x.md\nD\told.md\nR100\tdocs/specs/a.md\tdocs/archive/a.md'
    expect(parseNameStatus(raw)).toEqual([
      { status: 'M', path: 'package.json' },
      { status: 'A', path: 'docs/knowledge/decisions/ADR-0300-x.md' },
      { status: 'D', path: 'old.md' },
      { status: 'R', path: 'docs/archive/a.md', previousPath: 'docs/specs/a.md' },
    ])
  })
})
