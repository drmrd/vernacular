/**
 * The part of a renderer that owns an animation loop. The WebGPU renderer of
 * `three` satisfies it structurally, so this file needs no import from `three`.
 */
export interface AnimationLoopRenderer {
  setAnimationLoop(callback: (() => void) | null): unknown
  getAnimationLoop(): unknown
}

/**
 * Runs `draw` one time, inside the renderer's next animation-loop callback, and returns a cancel
 * function. The renderer resets its counts and advances its frame only right before it calls that
 * callback, so a draw made there is the first draw of its frame, while a draw made in a React effect
 * can share a frame with an earlier draw and skip once-per-frame work such as light values and
 * shadow maps.
 *
 * The renderer must be initialized before the call, because its animation loop accessors need that.
 * A later request on the same renderer replaces a pending one, because a renderer keeps one loop.
 * A cancel clears the loop only while this request is still the pending one.
 */
export function drawOnNextRendererFrame(
  renderer: AnimationLoopRenderer,
  draw: () => void,
): () => void {
  const loop = (): void => {
    renderer.setAnimationLoop(null)
    draw()
  }
  renderer.setAnimationLoop(loop)
  return () => {
    if (renderer.getAnimationLoop() === loop) {
      renderer.setAnimationLoop(null)
    }
  }
}
