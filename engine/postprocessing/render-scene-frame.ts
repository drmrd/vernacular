/** Minimal shapes so the dispatcher unit-tests without a real renderer or pipeline. */
export interface FrameRenderer {
  render(scene: object, camera: object): void
}

export interface AmbientOcclusionPipeline {
  render(): void
  setSize(width: number, height: number): void
  dispose(): void
}

/**
 * Draws one frame: through the AO pipeline when one is supplied, otherwise straight
 * through the renderer. The one seam both canvases call so the takeover has a single owner.
 */
export function renderSceneFrame(
  renderer: FrameRenderer,
  scene: object,
  camera: object,
  pipeline: AmbientOcclusionPipeline | null,
): void {
  if (pipeline !== null) {
    pipeline.render()
    return
  }
  renderer.render(scene, camera)
}
