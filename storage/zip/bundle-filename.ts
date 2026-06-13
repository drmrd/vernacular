import { filenameSlug } from '../download/filename-slug'

/** The fixed suffix every exported bundle filename ends in. */
const BUNDLE_SUFFIX = '.building'

/**
 * A safe `.building` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.building`.
 */
export function bundleFilename(projectName: string): string {
  return filenameSlug(projectName) + BUNDLE_SUFFIX
}
