import { describe, expect, it } from 'vitest'

import { readStoryIds } from './story-index'

// Behavior: extract the testable story ids from a built Storybook
// `storybook-static/index.json` (v8, "v": 5). The visual-regression Playwright
// spec screenshots one story per id, so this reader must (1) keep only entries
// whose `type === "story"` and drop `docs` autodocs pages, (2) keep only stories
// that participate in automated testing, which Storybook marks with the `test`
// tag (stories that opt out via the `!test` tag appear in the index without
// `test` in their tags), (3) return each surviving entry's `id`, and (4) sort
// the result ascending so screenshot runs enumerate stories in a stable,
// deterministic order. The fixture is the TEXT of an index.json, matching the
// real on-disk contents the reader will parse.

type IndexEntry = {
  id: string
  title: string
  name: string
  importPath: string
  type: 'story' | 'docs'
  tags: string[]
}

const importPath = './editor/design-system/button.stories.tsx'

type EntryFields = Pick<IndexEntry, 'id' | 'name' | 'type' | 'tags'>

function entry({ id, name, type, tags }: EntryFields): IndexEntry {
  return { id, title: 'Design System/Button', name, importPath, type, tags }
}

// A testable component story: Storybook tags it `test` so the visual-regression
// run screenshots it.
function storyEntry(id: string, name: string): IndexEntry {
  return entry({ id, name, type: 'story', tags: ['autodocs', 'test'] })
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
      storyEntry('design-system-button--secondary', 'Secondary'),
      entry({ id: 'design-system-button--docs', name: 'Docs', type: 'docs', tags: ['autodocs'] }),
      storyEntry('design-system-button--primary', 'Primary'),
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

  it('excludes a story that opts out of automated testing via a missing `test` tag', () => {
    // The app shell mounts the live WebGL scene, so it carries Storybook's
    // `!test` tag and appears in the index WITHOUT `test` in its tags. Even
    // though it is a `type === "story"` entry, the visual-regression run must
    // not screenshot it, while the `test`-tagged component story still survives.
    const indexWithUntestedStory = JSON.stringify({
      v: 5,
      entries: Object.fromEntries(
        [
          entry({
            id: 'app-shell--default',
            name: 'Default',
            type: 'story',
            tags: ['dev', 'manifest'],
          }),
          storyEntry('design-system-button--primary', 'Primary'),
        ].map((indexEntry) => [indexEntry.id, indexEntry]),
      ),
    })

    expect(readStoryIds(indexWithUntestedStory)).toEqual(['design-system-button--primary'])
  })

  it('returns an empty array when the index has no entries', () => {
    const emptyIndexJsonText = JSON.stringify({ v: 5, entries: {} })

    expect(readStoryIds(emptyIndexJsonText)).toEqual([])
  })
})
