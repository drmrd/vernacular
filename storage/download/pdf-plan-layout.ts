/** A page reserves a margin on every one of its four sides. */
const MARGIN_SIDES = 2

interface Size {
  width: number
  height: number
}

interface Placement {
  page: Size
  image: { x: number; y: number; width: number; height: number }
}

/** Content reads as landscape when it is wider than it is tall. */
function isLandscape(content: Size): boolean {
  return content.width > content.height
}

/** Swap a page's width and height so its longer edge runs horizontally. */
function toLandscape(page: Size): Size {
  return { width: page.height, height: page.width }
}

/** The largest factor that scales `content` to fit inside `available`. */
function fitScale(content: Size, available: Size): number {
  return Math.min(available.width / content.width, available.height / content.height)
}

/**
 * Place plan `content` on a printable page, returning the oriented page size
 * and the centered image rectangle within it.
 *
 * Orientation follows the content: landscape content (wider than tall) swaps the
 * page to landscape; otherwise the page keeps its given orientation.
 *
 * Fit scales the content to the largest size that fits inside the oriented page
 * minus `marginPt` on all four sides, preserving aspect ratio with no upper cap.
 *
 * Center positions the scaled image so the leftover space splits evenly between
 * opposite margins.
 */
export function placePlanOnPage(content: Size, page: Size, marginPt: number): Placement {
  const orientedPage = isLandscape(content) ? toLandscape(page) : page
  const available: Size = {
    width: orientedPage.width - marginPt * MARGIN_SIDES,
    height: orientedPage.height - marginPt * MARGIN_SIDES,
  }
  const scale = fitScale(content, available)
  const imageWidth = content.width * scale
  const imageHeight = content.height * scale
  return {
    page: orientedPage,
    image: {
      x: (orientedPage.width - imageWidth) / MARGIN_SIDES,
      y: (orientedPage.height - imageHeight) / MARGIN_SIDES,
      width: imageWidth,
      height: imageHeight,
    },
  }
}
