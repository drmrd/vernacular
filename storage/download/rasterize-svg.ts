import { rasterTargetSize } from './raster-target-size'

/** Default cap on the longest rasterized edge, in pixels. */
export const DEFAULT_RASTER_MAX_EDGE = 2000

/** Opaque white backing so transparent SVG regions render as white, not black. */
const CANVAS_BACKGROUND = '#ffffff'

/**
 * Rasterize an SVG string to PNG bytes via an `Image` and a `<canvas>`.
 *
 * This is the single place in the slice that touches `URL.createObjectURL`, the
 * `Image` loader, and a canvas 2D context, kept inside `storage/` per the rule
 * that browser and platform APIs are wrapped at a `storage/` seam (ADR-0001).
 * The pure scale rule lives in `rasterTargetSize`; this helper only performs the
 * DOM rasterization, scaling the longest edge down to at most `maxEdge`.
 */
export async function rasterizeSvgToPng(svg: string, maxEdge: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url)
    const { width, height } = rasterTargetSize(image.naturalWidth, image.naturalHeight, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('rasterizeSvgToPng: 2D canvas context unavailable')
    }
    context.fillStyle = CANVAS_BACKGROUND
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return await canvasToPngBytes(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Load `url` into an `HTMLImageElement`, resolving once decoded. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('rasterizeSvgToPng: failed to load SVG image'))
    image.src = url
  })
}

/** Encode `canvas` to PNG bytes, rejecting when the browser yields no blob. */
function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('rasterizeSvgToPng: canvas produced no PNG blob'))
        return
      }
      void blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch((error: unknown) =>
          reject(error instanceof Error ? error : new Error(String(error))),
        )
    }, 'image/png')
  })
}
