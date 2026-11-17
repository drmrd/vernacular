import type * as ThreeWebGPU from 'three/webgpu'

/**
 * Frees a scene renderer that its owner is done with. `started` is the promise that the
 * renderer's init() returned. The release waits for that start to settle:
 * - after a resolved start it calls dispose() once, which stops the renderer's animation
 *   loop and frees its GPU device or WebGL context;
 * - after a failed start it calls nothing, because a failed start built no animation loop
 *   and dispose() would then raise an unhandled rejection inside three.js.
 * It is safe to call while the start is still pending; dispose() never runs before the
 * start settles, since an early dispose() leaves the loop running. The returned promise
 * resolves once the release is done, and does not reject for a failed start.
 */
export function releaseSceneRenderer(
  renderer: Pick<ThreeWebGPU.WebGPURenderer, 'dispose'>,
  started: PromiseLike<unknown>,
): Promise<void> {
  return Promise.resolve(started).then(
    () => {
      renderer.dispose()
    },
    () => undefined,
  )
}
