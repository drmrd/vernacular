/** Stem used when a project name yields an empty slug. */
const FALLBACK_STEM = 'project'

/** Any run of characters outside the safe set, replaced by a single hyphen. */
const UNSAFE_RUN = /[^a-z0-9]+/g

/** Leading and trailing hyphens left after replacement, trimmed away. */
const EDGE_HYPHENS = /^-+|-+$/g

/**
 * A safe filename stem derived from a project name: lowercased, spaces and
 * unsafe characters collapsed to single hyphens, leading and trailing hyphens
 * trimmed, with a fixed fallback stem when the name yields an empty slug. The
 * result carries no suffix; callers append their own extension.
 */
export function filenameSlug(projectName: string): string {
  const slug = projectName.toLowerCase().replace(UNSAFE_RUN, '-').replace(EDGE_HYPHENS, '')
  return slug.length > 0 ? slug : FALLBACK_STEM
}
