/** The part of the frame state the size check reads; the R3F root state satisfies it. */
export interface FrameSizeState {
  gl: { domElement: { width: number; height: number }; getPixelRatio(): number }
  size: { width: number; height: number }
  camera: { aspect?: number }
}

/** How far the camera aspect may sit from the canvas aspect and still count. */
export const ASPECT_TOLERANCE = 1e-6

/** Whether a finished frame was drawn at the canvas's current size. */
export function frameMatchesCanvasSize(state: FrameSizeState): boolean {
  const { gl, size, camera } = state
  if (size.width <= 0 || size.height <= 0) return false
  const pixelRatio = gl.getPixelRatio()
  const bufferMatches =
    gl.domElement.width === Math.floor(size.width * pixelRatio) &&
    gl.domElement.height === Math.floor(size.height * pixelRatio)
  if (!bufferMatches) return false
  return (
    camera.aspect === undefined ||
    Math.abs(camera.aspect - size.width / size.height) <= ASPECT_TOLERANCE
  )
}
