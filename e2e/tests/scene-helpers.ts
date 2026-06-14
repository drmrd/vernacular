import { expect, type Locator, type Page } from '@playwright/test'

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
async function settledSceneCanvas(page: Page): Promise<Locator> {
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
  await page.getByRole('button', { name: 'Wall', exact: true }).click()
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 320, y: 120 } })
  await plan.click({ position: { x: 320, y: 260 } })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: /^Wall,/ }).first()).toBeVisible()

  return settledSceneCanvas(page)
}

// Draws a closed rectangular room in split view (four corners, then back on the first to
// close the loop), then returns the settled full-width 3D canvas. The closed room derives
// a floor slab that fills the framed view, so a click at the canvas centre reliably
// strikes an entity.
export async function drawnRoomCanvas(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()

  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('button', { name: 'Wall', exact: true }).click()
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 300, y: 120 } })
  await plan.click({ position: { x: 300, y: 260 } })
  await plan.click({ position: { x: 100, y: 260 } })
  await plan.click({ position: { x: 100, y: 120 } }) // back on the first corner closes the loop
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(1)

  return settledSceneCanvas(page)
}
