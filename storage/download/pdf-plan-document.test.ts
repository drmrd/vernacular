import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { svgPlanToPdf } from './pdf-plan-document'

// A known-good 4 wide x 2 tall (landscape) PNG, base64-encoded.
const LANDSCAPE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGMQqTjxHxkzoAsAADAFEplDKT7zAAAAAElFTkSuQmCC'

const LANDSCAPE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"></svg>'

// US Letter, swapped to landscape because the 4x2 content is wider than tall.
const LETTER_LANDSCAPE_WIDTH_PT = 792
const LETTER_LANDSCAPE_HEIGHT_PT = 612

const PDF_DIMENSION_PRECISION = 1

describe('svgPlanToPdf', () => {
  it('assembles a single-page landscape Letter PDF embedding the rasterized plan for imperial units', async () => {
    const fakePng = new Uint8Array(Buffer.from(LANDSCAPE_PNG_BASE64, 'base64'))

    const result = await svgPlanToPdf(LANDSCAPE_SVG, {
      units: 'imperial',
      rasterize: () => Promise.resolve(fakePng),
    })

    expect(result).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(result.subarray(0, 5))).toBe('%PDF-')

    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(1)

    const page = doc.getPage(0)
    expect(page.getWidth()).toBeCloseTo(LETTER_LANDSCAPE_WIDTH_PT, PDF_DIMENSION_PRECISION)
    expect(page.getHeight()).toBeCloseTo(LETTER_LANDSCAPE_HEIGHT_PT, PDF_DIMENSION_PRECISION)

    // The rasterized plan is embedded: the page references at least one image XObject.
    const xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
    expect(xObjects?.keys() ?? []).not.toHaveLength(0)
  })
})
