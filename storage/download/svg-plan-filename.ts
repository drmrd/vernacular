import { filenameSlug } from './filename-slug'

/** The fixed suffix every exported SVG plan filename ends in. */
const SVG_SUFFIX = '.svg'

/**
 * A safe `.svg` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.svg`.
 */
export function svgPlanFilename(projectName: string): string {
  return filenameSlug(projectName) + SVG_SUFFIX
}
