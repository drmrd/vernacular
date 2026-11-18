import { expect, type Locator, type Page } from '@playwright/test'

// Helpers for the specs that read what the live three-dimensional pane drew. They take the page
// and keep no state, so a spec can open and close the pane any number of times.
//
// Until the renderer module loads, the canvas wrapper shows a full-height stand-in canvas, and it
// then swaps it for the renderer's own canvas (bridge/react/scene-renderer-canvas.tsx). Every
// mount of the pane opens that window again. A wait for a canvas with a settled height accepts the
// stand-in, so a capture that follows can hit an element that is detached a moment later. The
// helpers therefore wait on the readiness marker of the live canvas, which belongs to one mount,
// and make each capture safe against a replaced element.

// The wrapper of the live canvas (bridge/react/scene-readiness.ts names the id and the attribute).
// Its attribute data-harness-ready turns "true" once the renderer of this mount has drawn its
// first frame (useFirstFrameReadiness, bridge/react/live-scene-frame-signal.tsx), which is after
// the stand-in canvas was replaced. The wrapper belongs to one mount of the pane and starts at
// "false" with each mount, unlike data-live-view-ready, which can still read true from an earlier
// open (issue #829).
const LIVE_SCENE_CANVAS_TEST_ID = 'live-scene-canvas'

// React Three Fiber mounts the canvas at the HTML default (~150px) height, then resizes it to
// the real pane box; a settled canvas is past that default.
const SETTLED_CANVAS_MIN_HEIGHT = 200

// How long a changed frame may take to appear in the live pane. A frame reaches the pane within a
// few frames once the scene changes, so the bound is generous margin, not a measured wait.
const FRAME_CHANGE_TIMEOUT_MS = 10_000

// Applied only for the duration of one screenshot. Visibility is inherited but can be restored
// on a descendant, so the canvas stays visible while every other element is hidden.
const CANVAS_ONLY_STYLE =
  'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'

// The error a capture gets when its element was replaced while the screenshot ran.
const DETACHED_ELEMENT = /Element is not attached to the DOM/

/** The wrapper of the live canvas of the current mount; it holds the canvas the renderer draws on. */
export function liveSceneCanvas(page: Page): Locator {
  return page.getByTestId(LIVE_SCENE_CANVAS_TEST_ID)
}

/**
 * Waits until the start-up of the current mount of the live pane is over: the renderer has drawn
 * its first frame, so its canvas is the one that stays, and that canvas is past the default
 * height. Returns the canvas locator, which is resolved anew on every use.
 */
export async function waitForLiveCanvasReady(page: Page): Promise<Locator> {
  await expect(liveSceneCanvas(page)).toHaveAttribute('data-harness-ready', 'true')
  const canvas = liveSceneCanvas(page).locator('canvas')
  await expect(canvas).toHaveCount(1)
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      message: 'waiting for the live 3D canvas to settle past its default size',
    })
    .toBeGreaterThan(SETTLED_CANVAS_MIN_HEIGHT)
  return canvas
}

async function captureCanvasOnce(page: Page): Promise<Buffer | undefined> {
  try {
    return await liveSceneCanvas(page).locator('canvas').screenshot({ style: CANVAS_ONLY_STYLE })
  } catch (error) {
    if (error instanceof Error && DETACHED_ELEMENT.test(error.message)) return undefined
    throw error
  }
}

/**
 * The pixels the renderer drew, without the overlays above the canvas. The canvas is resolved
 * anew on every try, and a try that finds its element replaced is repeated inside the poll,
 * because expect.poll does not retry a callback that throws. Any other error ends the capture.
 */
export async function captureLiveFrame(page: Page): Promise<Buffer> {
  let frame: Buffer | undefined
  await expect
    .poll(
      async () => {
        frame = await captureCanvasOnce(page)
        return frame !== undefined
      },
      { message: 'waiting for a canvas of the live 3D pane that stays attached while captured' },
    )
    .toBe(true)
  return frame as Buffer
}

/** Polls until two consecutive captures match, then returns that settled frame. */
export async function settledLiveFrame(page: Page): Promise<Buffer> {
  let last = await captureLiveFrame(page)
  await expect
    .poll(
      async () => {
        const next = await captureLiveFrame(page)
        const steady = next.equals(last)
        last = next
        return steady
      },
      { message: 'waiting for the live 3D canvas to reach a stable frame' },
    )
    .toBe(true)
  return last
}

async function waitForLiveFrame(
  page: Page,
  reference: Buffer,
  expected: { equal: boolean; message: string },
): Promise<void> {
  await expect
    .poll(async () => (await captureLiveFrame(page)).equals(reference), {
      message: expected.message,
      timeout: FRAME_CHANGE_TIMEOUT_MS,
    })
    .toBe(expected.equal)
}

/** Waits until the live pane draws a frame that differs from the reference frame. */
export async function waitForLiveFrameDifferentFrom(
  page: Page,
  reference: Buffer,
  message: string,
): Promise<void> {
  await waitForLiveFrame(page, reference, { equal: false, message })
}

/** Waits until the live pane draws a frame that equals the reference frame. */
export async function waitForLiveFrameEqualTo(
  page: Page,
  reference: Buffer,
  message: string,
): Promise<void> {
  await waitForLiveFrame(page, reference, { equal: true, message })
}
