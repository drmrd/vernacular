import { filenameSlug } from './filename-slug'

/** The fixed suffix every exported PDF plan filename ends in. */
const PDF_SUFFIX = '.pdf'

/**
 * A safe `.pdf` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.pdf`.
 */
export function pdfPlanFilename(projectName: string): string {
  return filenameSlug(projectName) + PDF_SUFFIX
}
