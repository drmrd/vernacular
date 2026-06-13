import { PDFDocument } from 'pdf-lib'

import type { UnitSystem } from '../../core'

import { pdfPageSize } from './pdf-page'
import { placePlanOnPage } from './pdf-plan-layout'
import { rasterizeSvgToPng } from './rasterize-svg'

/** Longest rasterized edge for print, in pixels, above the screen default for print quality. */
export const PRINT_RASTER_MAX_EDGE = 4000

/** Default page margin in PDF points (72 points = 1 inch), a half-inch border. */
export const PDF_DEFAULT_MARGIN_PT = 36

/** Options for assembling a single-page PDF plan document. */
export interface SvgPlanToPdfOptions {
  units: UnitSystem
  maxEdge?: number
  marginPt?: number
  rasterize?: (svg: string, maxEdge: number) => Promise<Uint8Array>
}

/**
 * Build a single-page PDF that embeds the rasterized plan, centered on a page
 * whose size derives from the project's unit system and whose orientation
 * follows the plan's aspect ratio.
 *
 * The rasterizer is the one browser dependency, so it is injectable: tests
 * supply a deterministic PNG while production defaults to the DOM rasterizer.
 * Keeping the dependency behind this seam leaves the page assembly unit-testable.
 * This module is the storage seam for pdf-lib (ADR-0068 / ADR-0001).
 */
export async function svgPlanToPdf(svg: string, options: SvgPlanToPdfOptions): Promise<Uint8Array> {
  const { units } = options
  const maxEdge = options.maxEdge ?? PRINT_RASTER_MAX_EDGE
  const marginPt = options.marginPt ?? PDF_DEFAULT_MARGIN_PT
  const rasterize = options.rasterize ?? rasterizeSvgToPng

  const png = await rasterize(svg, maxEdge)
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(png)
  const layout = placePlanOnPage(
    { width: image.width, height: image.height },
    pdfPageSize(units),
    marginPt,
  )
  const page = doc.addPage([layout.page.width, layout.page.height])
  page.drawImage(image, {
    x: layout.image.x,
    y: layout.image.y,
    width: layout.image.width,
    height: layout.image.height,
  })
  return await doc.save()
}
