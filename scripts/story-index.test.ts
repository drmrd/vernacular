import { describe, expect, it } from 'vitest'

import { readStoryIds } from './story-index'

// Behavior: extract the renderable story ids from a built Storybook
// `storybook-static/index.json` (v8, "v": 5). The visual-regression Playwright
// spec screenshots one story per id, so this reader must (1) keep only entries
// whose `type === "story"` and drop `docs` autodocs pages, (2) return each such
// entry's `id`, and (3) sort the result ascending so screenshot runs enumerate
// stories in a stable, deterministic order. The fixture is the TEXT of an
// index.json, matching the real on-disk contents the reader will parse.

type IndexEntry = {
  id: string
  title: string
  name: string
  importPath: string
  type: 'story' | 'docs'
  tags: string[]
}

const importPath = './editor/design-system/button.stories.tsx'

function entry(id: string, name: string, type: 'story' | 'docs'): IndexEntry {
  return { id, title: 'Design System/Button', name, importPath, type, tags: ['autodocs'] }
}

// Storybook story ids are kebab-case (e.g. `design-system-button--primary`), so
// the fixture builds the `entries` map from real-shaped entry objects keyed by
// id to mirror an on-disk `index.json` faithfully. Deliberately listed out of
// alphabetical order, with the `docs` entry interleaved, to prove the reader
// both filters and sorts rather than echoing insertion order.
const indexJsonText = JSON.stringify({
  v: 5,
  entries: Object.fromEntries(
    [
      entry('design-system-button--secondary', 'Secondary', 'story'),
      entry('design-system-button--docs', 'Docs', 'docs'),
      entry('design-system-button--primary', 'Primary', 'story'),
    ].map((indexEntry) => [indexEntry.id, indexEntry]),
  ),
})

describe('readStoryIds', () => {
  it('returns only story-type entry ids, sorted ascending, excluding docs entries', () => {
    expect(readStoryIds(indexJsonText)).toEqual([
      'design-system-button--primary',
      'design-system-button--secondary',
    ])
  })

  it('returns an empty array when the index has no entries', () => {
    const emptyIndexJsonText = JSON.stringify({ v: 5, entries: {} })

    expect(readStoryIds(emptyIndexJsonText)).toEqual([])
  })
})
