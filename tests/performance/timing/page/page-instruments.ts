import { installFrameProbe, type FrameProbe, type FrameProbeQueuePrototype } from '../frame-probe'

/**
 * What the timing page installs before any other module of the page runs: the frame probe on
 * `window` and on the GPU queue, and the visibility listener. `main.tsx` imports this module
 * first, so the probe wraps the frame functions before React, React Three Fiber, or three load.
 */
export interface PageInstruments {
  readonly probe: FrameProbe
  /**
   * Resolves at the start of the next frame, through the browser's own frame request and not the
   * probe's, so the page's own waits never become frame samples.
   */
  readonly hostFrame: () => Promise<number>
  /** True when the document was hidden at any time since the page loaded. */
  readonly everHidden: () => boolean
}

function isHidden(): boolean {
  return document.visibilityState === 'hidden'
}

function watchVisibility(): () => boolean {
  let hidden = isHidden()
  document.addEventListener('visibilitychange', () => {
    if (isHidden()) hidden = true
  })
  return () => hidden
}

function gpuQueuePrototype(): FrameProbeQueuePrototype | undefined {
  return typeof GPUQueue === 'undefined' ? undefined : GPUQueue.prototype
}

function installInstruments(): PageInstruments {
  const everHidden = watchVisibility()
  const request = window.requestAnimationFrame.bind(window)
  const probe = installFrameProbe(
    {
      requestAnimationFrame: request,
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      now: () => performance.now(),
      isHidden,
      queuePrototype: gpuQueuePrototype(),
    },
    window,
  )
  return { probe, everHidden, hostFrame: () => new Promise((resolve) => request(resolve)) }
}

/** The one set of instruments of the page, installed when this module is evaluated. */
export const pageInstruments: PageInstruments = installInstruments()
