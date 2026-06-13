import { filenameSlug } from './filename-slug'

/** The fixed suffix every exported PNG plan filename ends in. */
const PNG_SUFFIX = '.png'

/**
 * A safe `.png` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.png`.
 */
export function pngPlanFilename(projectName: string): string {
  return filenameSlug(projectName) + PNG_SUFFIX
}
