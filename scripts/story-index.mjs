// Reads the ids of every story entry from the text of Storybook's static
// index.json. Docs entries (and any non-story type) are excluded. Used by the
// visual-regression spec to enumerate which stories to screenshot.

export function readStoryIds(indexJsonText) {
  const index = JSON.parse(indexJsonText)
  const entries = index.entries
  if (!entries) {
    return []
  }
  return Object.values(entries)
    .filter((entry) => entry.type === 'story')
    .map((entry) => entry.id)
    .sort()
}
