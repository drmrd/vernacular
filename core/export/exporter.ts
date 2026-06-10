import type { Project } from '../model/types'

/** The IANA media type of an export artifact. Open string union; new exporters extend it. */
export type ExportMediaType = 'image/svg+xml' | 'application/pdf' | 'image/png' | (string & {})

/** A single produced artifact: its media type, a suggested file extension, and the content. */
export interface ExportResult {
  /** IANA media type, e.g. 'image/svg+xml'. */
  media: ExportMediaType
  /** Suggested file extension without the leading dot, e.g. 'svg'. */
  extension: string
  /**
   * The artifact content. Text formats (SVG) carry a UTF-8 string; this slice
   * produces only text. Binary formats (PNG, PDF) are added behind this seam in
   * later slices and will widen `content` to a `Uint8Array` branch then; this
   * slice deliberately ships only the string branch (YAGNI).
   */
  content: string
}

/**
 * Produces an export artifact from a project. Pure read: it never dispatches a
 * command and never mutates the project (rule 3, ADR-0005). Implementations live
 * in `core/export/` and consume the model plus the scene-graph derivation
 * (design specification 6.1, 6.12; ADR-0018, ADR-0044 output-and-export track).
 */
export interface Exporter<Options = void> {
  /** The media type this exporter produces. */
  readonly media: ExportMediaType
  /** Produce the artifact. `options` defaults are the exporter's own concern. */
  export(project: Project, options?: Options): ExportResult
}
