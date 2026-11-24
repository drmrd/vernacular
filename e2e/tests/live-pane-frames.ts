import { errors, expect, type Locator, type Page } from '@playwright/test'

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
// first counted frame (useDrawnRevision, bridge/react/live-scene-frame-signal.tsx), which is after
// the stand-in canvas was replaced. The wrapper belongs to one mount of the pane and starts at
// "false" with each mount. data-live-view-ready also reads false at mount and only turns true
// once the session is restored and a frame has drawn after the pipeline and ground texture settled
// (bridge/react/use-live-view-readiness.ts), so it no longer carries a stale true from an earlier
// open.
const LIVE_SCENE_CANVAS_TEST_ID = 'live-scene-canvas'

// The two revisions the wrapper publishes (bridge/react/scene-readiness.ts): the scene revision
// the mount has built, and the revision of the last counted frame, which is '' until the first.
const SCENE_REVISION_ATTRIBUTE = 'data-scene-revision'
const DRAWN_REVISION_ATTRIBUTE = 'data-drawn-revision'

// React Three Fiber mounts the canvas at the HTML default (~150px) height, then resizes it to
// the real pane box; a settled canvas is past that default.
const SETTLED_CANVAS_MIN_HEIGHT = 200

// How long a changed frame may take to appear in the live pane. A frame reaches the pane within a
// few frames once the scene changes, so the bound is generous margin, not a measured wait.
const FRAME_CHANGE_TIMEOUT_MS = 10_000

// How long the first drawn frame of one mount may take. On a slow software renderer the first frame
// follows a shader build, so this is generous margin, not a measured wait. It is not below the
// default expect timeout (5 s) that these waits used before.
const LIVE_CANVAS_READY_TIMEOUT_MS = 10_000

// The limit of one screenshot call. Playwright runs the screenshots of a page one at a time, and
// the poll around a capture gives up waiting without cancelling a call that is stuck, so one
// stuck call would block every later capture until the test timeout. A normal capture of the
// canvas takes well under a second; this limit is a few times that.
const SCREENSHOT_TIMEOUT_MS = 3_000

// The limit of the whole poll around one capture. It leaves room for several tries (each ends at
// the screenshot limit at the latest) and stays well under the 30 s test timeout, so a pane that
// never becomes readable fails here with a clear message and not at the test timeout.
const CAPTURE_TIMEOUT_MS = 12_000

// Applied only for the duration of one screenshot. Visibility is inherited but can be restored
// on a descendant, so the canvas stays visible while every other element is hidden.
const CANVAS_ONLY_STYLE =
  'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'

// The error a screenshot gets when its element was replaced while it ran.
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
  await expect(liveSceneCanvas(page)).toHaveAttribute('data-harness-ready', 'true', {
    timeout: LIVE_CANVAS_READY_TIMEOUT_MS,
  })
  const canvas = liveSceneCanvas(page).locator('canvas')
  await expect(canvas).toHaveCount(1, { timeout: LIVE_CANVAS_READY_TIMEOUT_MS })
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      message: 'waiting for the live 3D canvas to settle past its default size',
      timeout: LIVE_CANVAS_READY_TIMEOUT_MS,
    })
    .toBeGreaterThan(SETTLED_CANVAS_MIN_HEIGHT)
  return canvas
}

// A screenshot that fails because its element was replaced, or because it hit its own time limit,
// is worth another try. Playwright's TimeoutError is recognized by its class and not by its text.
function isRetryableCaptureError(error: unknown): boolean {
  if (error instanceof errors.TimeoutError) return true
  return error instanceof Error && DETACHED_ELEMENT.test(error.message)
}

async function captureCanvasOnce(page: Page): Promise<Buffer | undefined> {
  try {
    return await liveSceneCanvas(page)
      .locator('canvas')
      .screenshot({ style: CANVAS_ONLY_STYLE, timeout: SCREENSHOT_TIMEOUT_MS })
  } catch (error) {
    if (isRetryableCaptureError(error)) return undefined
    throw error
  }
}

/**
 * The pixels the renderer drew, without the overlays above the canvas. The canvas is resolved
 * anew on every try. Two things are tried again inside the poll, because expect.poll does not
 * retry a callback that throws: a screenshot whose canvas was replaced while it ran (the pane
 * swaps its stand-in canvas for the real one at start-up), and a screenshot that did not finish
 * within its own time limit (one stuck call would otherwise block every later capture of the
 * page). Any other error ends the capture. A pane that never gives a capture fails when the
 * poll's limit is over.
 */
export async function captureLiveFrame(page: Page): Promise<Buffer> {
  let frame: Buffer | undefined
  await expect
    .poll(
      async () => {
        frame = await captureCanvasOnce(page)
        return frame !== undefined
      },
      {
        message:
          'waiting for a capture of the live 3D canvas: either the canvas was replaced during ' +
          `each try, or the screenshot did not finish within ${SCREENSHOT_TIMEOUT_MS} ms`,
        timeout: CAPTURE_TIMEOUT_MS,
      },
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

/** The scene revision of the current mount and the revision its last counted frame drew. */
export interface LiveSceneRevisions {
  readonly scene: number
  /** Null until the mount has drawn its first counted frame. */
  readonly drawn: number | null
}

/** Reads the two revision attributes of the live canvas wrapper; '' (no frame yet) reads as null. */
export async function liveSceneRevisions(page: Page): Promise<LiveSceneRevisions> {
  const wrapper = liveSceneCanvas(page)
  const options = { timeout: FRAME_CHANGE_TIMEOUT_MS }
  const scene = await wrapper.getAttribute(SCENE_REVISION_ATTRIBUTE, options)
  const drawn = await wrapper.getAttribute(DRAWN_REVISION_ATTRIBUTE, options)
  return {
    scene: Number(scene),
    drawn: drawn === null || drawn === '' ? null : Number(drawn),
  }
}

async function pollDrawnRevision(
  page: Page,
  accepts: (revisions: LiveSceneRevisions & { drawn: number }) => boolean,
  message: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const revisions = await liveSceneRevisions(page)
        if (revisions.drawn === null || !accepts({ ...revisions, drawn: revisions.drawn })) {
          return false
        }
        return true
      },
      { message, timeout: FRAME_CHANGE_TIMEOUT_MS },
    )
    .toBe(true)
}

/**
 * Waits until the current mount has drawn the scene revision it holds: a counted frame at that
 * revision, so every edit made so far is on screen. The revision restarts
 * at 1 on each mount, so the wait belongs after any switch of the view.
 */
export async function waitForDrawnSceneRevision(page: Page): Promise<void> {
  await pollDrawnRevision(
    page,
    ({ scene, drawn }) => drawn === scene,
    'waiting for the live 3D pane to draw the current scene revision',
  )
}

/**
 * Reads the drawn revision, runs the change, then waits until a counted frame at a later revision
 * that is also the current scene revision. Start it after any view switch
 * (the preview can remount, and its revision then restarts), never across one. A change that
 * builds no new scene (a camera move, a selection outline) never satisfies it.
 */
export async function waitForDrawnSceneChange(
  page: Page,
  change: () => Promise<void>,
): Promise<void> {
  const before = (await liveSceneRevisions(page)).drawn ?? 0
  await change()
  await pollDrawnRevision(
    page,
    ({ scene, drawn }) => drawn > before && drawn === scene,
    'waiting for the live 3D pane to draw a later scene revision',
  )
}
