import { expect, type Locator, type Page } from '@playwright/test'
import type { Srgb } from '../../core'

// Shared helpers for the live three-dimensional pane specs (navigation, color
// temperature, selection). The live view renders through the non-deterministic WebGPU
// backend (ADR-0045), so these specs assert semantically (a settled frame changes after
// an action) rather than against a committed pixel baseline.

// React Three Fiber mounts the canvas at the HTML default (~150px) height, then resizes
// it to the real pane box; a settled canvas is past that default.
const SETTLED_CANVAS_MIN_HEIGHT = 200

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

  const pane = page.getByRole('region', { name: /3d preview/i })
  const canvas = pane.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      message: 'waiting for the live 3D canvas to settle past its default size',
    })
    .toBeGreaterThan(SETTLED_CANVAS_MIN_HEIGHT)
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

// The side of the square sample patch, in screenshot pixels. Averaging a patch rather than
// reading one pixel damps per-pixel WebGL nondeterminism.
const SAMPLE_PATCH_PX = 24
// The RGBA stride of an ImageData buffer.
const RGBA_STRIDE = 4
// The maximum value of an 8-bit sRGB channel, for scaling to a 0..1 fraction.
const SRGB_MAX = 255

// Runs in the browser (page context): decode a PNG data URL, draw it to a 2D canvas, and
// average a square patch to one gamma-encoded sRGB triple in 0..1. Kept as a self-contained
// top-level function (no closure over module scope) so Playwright can serialize it into the
// page, and so sampleCanvasColor stays at one level of abstraction. The patch is centered on
// the given (cx, cy) fractions of the image; stride is the RGBA byte stride and max the 8-bit
// channel maximum.
async function averageImagePatch({
  url,
  patch,
  stride,
  max,
  cx,
  cy,
}: {
  url: string
  patch: number
  stride: number
  max: number
  cx: number
  cy: number
}): Promise<Srgb> {
  const image = new Image()
  image.src = url
  await image.decode()
  const surface = document.createElement('canvas')
  surface.width = image.width
  surface.height = image.height
  const context = surface.getContext('2d')
  if (context === null) throw new Error('no 2d context for the sample surface')
  context.drawImage(image, 0, 0)
  const originX = Math.round(image.width * cx - patch / 2)
  const originY = Math.round(image.height * cy - patch / 2)
  const { data } = context.getImageData(originX, originY, patch, patch)
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < data.length; index += stride) {
    red += data[index]
    green += data[index + 1]
    blue += data[index + 2]
  }
  const pixels = data.length / stride
  return { r: red / pixels / max, g: green / pixels / max, b: blue / pixels / max }
}

// Averages a square patch, centered on the canvas by default, of the settled harness canvas
// to one gamma-encoded sRGB triple in 0..1 (ready for srgbToOkLab). The harness renderer does
// not preserve its drawing buffer, so an in-page getImageData on the live canvas reads an
// already-cleared buffer (see scene-solar.spec.ts); the compositor screenshot is the source
// of truth. We screenshot the canvas, hand the PNG back to the page as a data URL, and read
// pixels from the browser's native decode, so no image-decoding dependency is needed. The
// optional center fractions (0..1 of width and height) place the patch when the sampled
// surface is not at frame center.
export async function sampleCanvasColor(
  page: Page,
  canvas: Locator,
  center: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Promise<Srgb> {
  const png = await canvas.screenshot()
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return page.evaluate(averageImagePatch, {
    url: dataUrl,
    patch: SAMPLE_PATCH_PX,
    stride: RGBA_STRIDE,
    max: SRGB_MAX,
    cx: center.x,
    cy: center.y,
  })
}
