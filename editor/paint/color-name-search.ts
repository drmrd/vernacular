import type { NamedColor } from '../../core'

/** Case-insensitive ranked search of named colors. Empty query returns all, in order. */
export function searchColorNames(query: string, candidates: readonly NamedColor[]): NamedColor[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return [...candidates]
  }
  return candidates
    .map((candidate) => ({ candidate, index: candidate.name.toLowerCase().indexOf(needle) }))
    .filter((scored) => scored.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((scored) => scored.candidate)
}
