import { test, expect, type Locator, type Page } from '@playwright/test'

// Exercises the live three-dimensional pane's navigation (orbit drag and, later,
// walk keys). Runs only in the GPU `scene-webgl` Playwright project (the config
// routes `scene-*.spec.ts` there) and self-skips without WebGPU, because the live
// pane renders through the WebGPU backend and otherwise shows a fallback message.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders
// through the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel
// baseline is not pinned). Each test settles the canvas to a stable frame, performs a
// navigation gesture, settles again, and requires the frame to change.

// Polls until the canvas reaches a steady frame (two consecutive identical
// screenshots), then returns that stable frame. The scene has no animation, so a
// steady frame is the settled render rather than a mid-init transient.
async function stableFrame(canvas: Locator): Promise<Buffer> {
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

// Opens split view, draws a short open run of walls so the framed scene has geometry
// to navigate around, and returns the settled 3D canvas locator.
async function drawnSceneCanvas(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()

  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 320, y: 120 } })
  await plan.click({ position: { x: 320, y: 260 } })
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Walls: \d/)).toBeVisible()

  const pane = page.getByRole('region', { name: /3d preview/i })
  const canvas = pane.locator('canvas')
  await expect(canvas).toBeVisible()
  // React Three Fiber mounts the canvas at the HTML default size, then resizes it to
  // the real pane box; wait past that so frames are captured at the settled size.
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      message: 'waiting for the live 3D canvas to settle past its default size',
    })
    .toBeGreaterThan(200)
  return canvas
}

test.describe('Live three-dimensional navigation', () => {
  test('orbit drag changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 120, centerY + 40, { steps: 8 })
    await page.mouse.up()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
