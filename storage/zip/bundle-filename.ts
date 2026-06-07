/** Stem used when a project name yields an empty slug. */
const FALLBACK_STEM = 'project'

/** The fixed suffix every exported bundle filename ends in. */
const BUNDLE_SUFFIX = '.house.zip'

/** Any run of characters outside the safe set, replaced by a single hyphen. */
const UNSAFE_RUN = /[^a-z0-9]+/g

/** Leading and trailing hyphens left after replacement, trimmed away. */
const EDGE_HYPHENS = /^-+|-+$/g

/**
 * A safe `.house.zip` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.house.zip`.
 */
export function bundleFilename(projectName: string): string {
  const slug = projectName.toLowerCase().replace(UNSAFE_RUN, '-').replace(EDGE_HYPHENS, '')
  const stem = slug.length > 0 ? slug : FALLBACK_STEM
  return stem + BUNDLE_SUFFIX
}
