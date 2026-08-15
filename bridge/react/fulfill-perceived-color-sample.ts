import { colorFromOkLab, srgbToOkLab } from '../../core'
import { sampleRenderedColor, type RenderedPixelReader } from '../../engine'
import type { PerceivedColorStore } from '../perceived-color/perceived-color-store'

/**
 * Advance a pending perceived-color request toward resolution, given
 * whatever `RenderedPixelReader` the current frame can offer.
 */
export function fulfillPerceivedColorSample(
  store: PerceivedColorStore,
  reader: RenderedPixelReader | null,
): void {
  const request = store.getRequest()
  // This runs on every animation frame, so the no-request path has to stay
  // free: most frames have nothing pending and must not touch the reader.
  if (request === null) return

  // A canvas that cannot yield a 2D context this frame may yield one on a
  // later frame, so a missing reader leaves the request pending rather than
  // failing it.
  if (reader === null) return

  const sampled = sampleRenderedColor(reader, request.ndc)
  if (sampled === null) {
    // The point cannot be sampled at all (an empty buffer or an
    // out-of-viewport NDC point), so drop the request outright rather than
    // leaving it pending to be retried every frame forever.
    store.clear()
    return
  }

  store.resolveSample({ surface: request.surface, color: colorFromOkLab(srgbToOkLab(sampled)) })
}
