// Takes the raw file TEXT (not a parsed object) so the caller owns when disk
// I/O happens. Stays dependency-free to honor the 30-day dependency cooldown.

export function readStoryIds(indexJsonText) {
  let index
  try {
    index = JSON.parse(indexJsonText)
  } catch (error) {
    throw new Error('Failed to parse the Storybook index.json', { cause: error })
  }
  const entries = index.entries
  if (!entries) {
    return []
  }
  return Object.values(entries)
    .filter((entry) => entry.type === 'story' && entry.tags.includes('test'))
    .map((entry) => entry.id)
    .sort()
}
