import type { Color, SurfaceRef } from '../../core'

// A perceived color is an observation of the rendered scene, not an
// authored fact about the model, so it is never dispatched as a command
// and never undoable. This mirrors the `highlighted` field on the
// surface-selection store: ephemeral bridge state that reflects what the
// user is looking at rather than what they have decided.
export interface PerceivedColorRequest {
  readonly surface: SurfaceRef
  readonly ndc: { readonly x: number; readonly y: number }
}

export interface PerceivedColorSample {
  readonly surface: SurfaceRef
  readonly color: Color
}

export interface PerceivedColorStore {
  getRequest(): PerceivedColorRequest | null
  requestSample(surface: SurfaceRef, ndc: { x: number; y: number }): void
  getSample(): PerceivedColorSample | null
  resolveSample(sample: PerceivedColorSample): void
  clear(): void
  subscribe(listener: () => void): () => void
}

export function createPerceivedColorStore(): PerceivedColorStore {
  let request: PerceivedColorRequest | null = null
  let sample: PerceivedColorSample | null = null
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getRequest: () => request,
    requestSample: (surface, ndc) => {
      // Clear any stale sample so a readout from a previous pick never
      // sits under a new pick pretending to describe it.
      request = { surface, ndc }
      sample = null
      notify()
    },
    getSample: () => sample,
    resolveSample: (resolved) => {
      // The request is one-shot: the frame callback samples the drawing
      // buffer once in response, rather than re-reading it every frame.
      sample = resolved
      request = null
      notify()
    },
    clear: () => {
      request = null
      sample = null
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
