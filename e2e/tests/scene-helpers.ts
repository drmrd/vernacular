import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SamplePatch } from './canvas-patch'
import { waitForDrawnSceneRevision, waitForLiveCanvasReady } from './live-pane-frames'

// Shared helpers for the live three-dimensional pane specs (navigation, color
// temperature, selection). The live view renders through the non-deterministic WebGPU
// backend (ADR-0045), so these specs assert semantically (a settled frame changes after
// an action) rather than against a committed pixel baseline.

// Polls until the canvas reaches a steady frame (two consecutive identical
// screenshots), then returns that stable frame. The scene has no animation, so a
// steady frame is the settled render rather than a mid-init transient.
export async function stableFrame(canvas: Locator): Promise<Buffer> {
  let last = await canvas.screenshot()
  await expect
    .poll(
      async () => {
        const next = await canvas.screenshot()
        const steady = next.equals(last)
        last = next
        return steady
      },
      { message: 'waiting for the live 3D canvas to reach a stable frame' },
    )
    .toBe(true)
  return last
}

// Switches to the full-width 3D view and returns the settled canvas. The full-width
// view gives the largest, most stable canvas to measure; the framing now adapts to the
// pane aspect ratio (ADR-0075), so the slim split pane also frames the model on screen.
export async function settledSceneCanvas(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '3D view' }).click()

  const canvas = await waitForLiveCanvasReady(page)
  // The mount has drawn the scene it holds, so every edit made so far is on screen. The view
  // switch above can remount the preview, so this wait follows it.
  await waitForDrawnSceneRevision(page)
  return canvas
}

// Draws a short open run of walls in split view (where the plan is reachable), then
// returns the settled full-width 3D canvas.
export async function drawnSceneCanvas(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()

  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 320, y: 120 } })
  await plan.click({ position: { x: 320, y: 260 } })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: /^Wall,/ }).first()).toBeVisible()

  return settledSceneCanvas(page)
}

// Switches to split view and draws a closed rectangular room (four corners, then back on
// the first to close the loop), returning the plan locator for any further drawing. The
// closed room derives a floor slab that fills the framed view, so a click at the canvas
// centre reliably strikes an entity.
async function drawClosedRectangularRoom(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()

  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 300, y: 120 } })
  await plan.click({ position: { x: 300, y: 260 } })
  await plan.click({ position: { x: 100, y: 260 } })
  await plan.click({ position: { x: 100, y: 120 } }) // back on the first corner closes the loop
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(1)

  return plan
}

// Draws a closed rectangular room, then returns the settled full-width 3D canvas.
export async function drawnRoomCanvas(page: Page): Promise<Locator> {
  await drawClosedRectangularRoom(page)
  return settledSceneCanvas(page)
}

// Draws a closed rectangular room, then places one door on the top wall before switching
// to 3D. Opening proxies read through an accessible label that ends in "wide" (e.g.
// "Single Swing Door, 900 mm wide"), so a single such option confirms the door landed.
// Returns the settled full-width 3D canvas with the opening in the model.
export async function drawnRoomWithDoorCanvas(page: Page): Promise<Locator> {
  const plan = await drawClosedRectangularRoom(page)
  // Arm opening placement, then host one door on the midpoint of the top wall.
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await plan.click({ position: { x: 200, y: 120 } })
  await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(1)

  return settledSceneCanvas(page)
}

// Opens the deterministic scene harness with the given query (for example
// `&scene=winter-afternoon`) and returns its canvas once it is visible, WITHOUT waiting for the
// lit frame. The harness renders through WebGL 2, so it runs on darwin Metal and on the linux
// SwiftShader lane and self-skips only where no WebGL 2 context can be created; the subject
// names the spec in the skip message. A caller that needs a step before the readiness wait uses
// this and waits for the frame itself.
async function openHarnessScene(page: Page, query: string, subject: string): Promise<Locator> {
  await page.goto(`/?fixture=scene-harness${query}`)
  const canvas = page.getByTestId('scene-harness').locator('canvas')
  await expect(canvas).toBeVisible()
  const hasWebGl2 = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return probe.getContext('webgl2') !== null
  })
  test.skip(!hasWebGl2, `No WebGL 2 context on this runner; ${subject} self-skips here.`)
  return canvas
}

// Opens the harness as `openHarnessScene` does, then WAITS for the lit frame, so a sample reads
// the sky-lit frame. The harness draws its ready frame in the renderer's own animation loop, on
// a frame of its own, and data-harness-ready turns true in the commit after that frame was
// drawn, so a capture taken once the attribute is true holds the ready frame. The subject
// defaults to the text the specs without a subject of their own have always got. It then waits
// for the ground grass (data-ground-texture="ready"), so a capture never holds a flat lawn that
// is about to be textured, and a failed pack fetch fails the spec instead of writing a flat
// baseline.
export async function settledHarnessCanvas(
  page: Page,
  query: string,
  subject = 'the harness gate',
): Promise<Locator> {
  const canvas = await openHarnessScene(page, query, subject)
  await expect(page.getByTestId('scene-harness')).toHaveAttribute('data-harness-ready', 'true')
  await expect(page.getByTestId('scene-harness')).toHaveAttribute('data-ground-texture', 'ready')
  return canvas
}

// Prints one numeric reading of a scene gate as `[reading] <label>: <value>`, so a run with the
// list reporter shows the numbers a gate compares, not only whether it passed.
export function logReading(label: string, value: string): void {
  // The list reporter relays the test process's stdout; this is the one place a gate prints.
  // eslint-disable-next-line no-console
  console.log(`[reading] ${label}: ${value}`)
}

// The harness canvas is 320 x 240 CSS pixels at device scale 1, the frame the committed
// harness baselines already pin. The regions the pixel gates sample are pixel rectangles on
// that frame; `sampleCanvasColor` takes a patch center as frame fractions, so they convert.
export const HARNESS_CANVAS_WIDTH_PX = 320
export const HARNESS_CANVAS_HEIGHT_PX = 240

// A square region of the frame given by its top-left corner and side, in frame pixels.
export function squareRegion(originXPx: number, originYPx: number, sizePx: number): SamplePatch {
  const half = sizePx / 2
  return {
    x: (originXPx + half) / HARNESS_CANVAS_WIDTH_PX,
    y: (originYPx + half) / HARNESS_CANVAS_HEIGHT_PX,
    sizePx,
  }
}

/**
 * The south exterior face, the door wall (outward normal toward world south), clear of the door
 * and the wall edges: x 143..166, y 148..171. It belongs to the `shell-south-window` scene seen
 * from the harness's default camera, which the `equinox-noon`, `winter-afternoon`, and
 * `overcast-noon` states share; the states with their own camera pose frame the wall elsewhere.
 */
// eslint-disable-next-line no-magic-numbers -- frame pixel coordinates, measured on the captured frame
export const DEFAULT_VIEW_SOUTH_WALL = squareRegion(143, 148, 24)

/**
 * The east exterior face, the window wall (outward normal toward world east), between the
 * south-east corner and the window: x 188..199, y 145..156. Same scene and default camera as
 * `DEFAULT_VIEW_SOUTH_WALL`. The face is about 21 px wide here, so this is the largest square
 * that keeps 4 px from the corner and from the window reveal.
 */
// eslint-disable-next-line no-magic-numbers -- frame pixel coordinates, measured on the captured frame
export const DEFAULT_VIEW_EAST_WALL = squareRegion(188, 145, 12)

/**
 * The west exterior face seen from the south-west camera, below the eaves and above the
 * darkening where the wall meets the lawn: x 121..144, y 107..130. The `daylight-reference`,
 * `low-sun`, and `sample-daylight` states all use this camera. Over these rows and columns the
 * face spans x 117..150 and y 102..142 and renders one color in the `daylight-reference` and
 * `low-sun` frames, so the square keeps at least 4 px from every edge.
 */
// eslint-disable-next-line no-magic-numbers -- frame pixel coordinates, measured on the captured frame
export const SOUTH_WEST_VIEW_WEST_WALL = squareRegion(121, 107, 24)

/**
 * The south exterior face seen from the same south-west camera, below the south window, clear
 * of the window sill, the wall's south-west corner, and the darkening where the wall meets the
 * lawn: x 157..162, y 143..148. The face is small in this view; in the `daylight-reference` and
 * `low-sun` frames it spans at least x 153..172 and y 139..152 over these rows and columns, so
 * this 6 px square keeps at least 4 px from every edge. In the `sample-daylight` frame this is
 * the front, the face with the door.
 */
// eslint-disable-next-line no-magic-numbers -- frame pixel coordinates, measured on the captured frame
export const SOUTH_WEST_VIEW_SOUTH_WALL = squareRegion(157, 143, 6)

/**
 * The lawn in the sun east of the building's shadow in the `shadow-on-lawn` frame, at the same
 * depth in the view as the shadowed lawn: x 236..259, y 109..132. No edge of the shadow or the
 * lawn comes within 13 px of it. The sun-to-shade gate and the grass texture gate both read it.
 */
// eslint-disable-next-line no-magic-numbers -- frame pixel coordinates, measured on the captured frame
export const SUN_TO_SHADE_SUNLIT_LAWN = squareRegion(236, 109, 24)
