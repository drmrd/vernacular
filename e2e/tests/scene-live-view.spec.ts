import { test, expect, type Locator } from '@playwright/test'

// This exercises the editor's LIVE three-dimensional preview pane (`WebGPUSceneView`),
// not the deterministic `?fixture=scene-harness` render harness. It reproduces the
// user-reported bug: in Split view the 3D pane stays blank because the live view never
// frames its camera (React Three Fiber's default camera cannot contain the
// millimeter-scale scene) and never updates when the plan changes.
//
// It runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there) and self-skips when WebGPU is unavailable, because the live
// pane renders through the WebGPU backend and otherwise shows a fallback message instead
// of a canvas.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders
// through the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel
// baseline is not pinned). It compares two STABLE frames - blank vs after a wall is
// drawn - and requires them to differ. Stability matters: an earlier version of this
// test fired on a transient frame during canvas init and passed even on the unfixed,
// always-blank view, so each frame is captured only once two consecutive screenshots
// match.

// Polls until the canvas reaches a steady frame (two consecutive identical screenshots),
// then returns that stable frame. The scene has no animation, so a steady frame is the
// settled render rather than a mid-init transient.
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

test.describe('Live three-dimensional preview pane', () => {
  test('reflects a drawn wall in the split-view 3D pane', async ({ page }) => {
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    // Split view keeps the plan and the 3D pane mounted together, so drawing a wall and
    // the 3D pane reacting happen without a remount (which is the user's scenario).
    await page.getByRole('button', { name: 'Split view' }).click()

    const pane = page.getByRole('region', { name: /3d preview/i })
    const canvas = pane.locator('canvas')
    await expect(canvas).toBeVisible()
    // React Three Fiber mounts the canvas at the HTML default 300x150, then resizes it to
    // the real pane box. Wait past that default so both frames are captured at the settled
    // size; otherwise a transient size difference, not wall content, fails the comparison.
    await expect
      .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
        message: 'waiting for the live 3D canvas to settle past its default size',
      })
      .toBeGreaterThan(200)

    const blankFrame = await stableFrame(canvas)

    // Draw one wall in the plan pane (visible beside the 3D pane in split view).
    const plan = page.getByLabel('Floor plan')
    await expect(plan).toBeVisible()
    await page.getByRole('button', { name: 'Draw wall' }).click()
    await plan.click({ position: { x: 100, y: 150 } })
    await plan.click({ position: { x: 300, y: 150 } })
    // Finish the run with Enter so the buffered wall commits.
    await page.keyboard.press('Enter')
    await expect(page.getByText('Walls: 1')).toBeVisible()

    const drawnFrame = await stableFrame(canvas)

    // The settled 3D frame must change once the live view frames the drawn geometry.
    // On the unfixed view both frames are the identical blank render.
    expect(drawnFrame.equals(blankFrame)).toBe(false)
  })
})
