/**
 * The part of the frame state the size check reads; the R3F root state satisfies it.
 * The camera is either one with an aspect (perspective) or an orthographic one, which has none.
 */
export interface FrameSizeState {
  gl: { domElement: { width: number; height: number }; getPixelRatio(): number }
  size: { width: number; height: number }
  camera: { aspect?: number } | { isOrthographicCamera: boolean }
}

/**
 * How far the camera aspect may sit from the canvas aspect and still count.
 * 1e-6 absorbs float rounding in the aspect ratio and stays far below one
 * pixel of drift.
 */
export const ASPECT_TOLERANCE = 1e-6

/** Whether a finished frame was drawn at the size the renderer holds for the canvas. */
export function frameMatchesCanvasSize(state: FrameSizeState): boolean {
  const { gl, size, camera } = state
  // A zero size means the canvas is not laid out yet, so nothing was drawn at it.
  if (size.width <= 0 || size.height <= 0) return false
  const pixelRatio = gl.getPixelRatio()
  // The renderer floors the drawing buffer size the same way when it sets the size.
  const bufferMatches =
    gl.domElement.width === Math.floor(size.width * pixelRatio) &&
    gl.domElement.height === Math.floor(size.height * pixelRatio)
  if (!bufferMatches) return false
  return (
    !('aspect' in camera) ||
    camera.aspect === undefined ||
    Math.abs(camera.aspect - size.width / size.height) <= ASPECT_TOLERANCE
  )
}
