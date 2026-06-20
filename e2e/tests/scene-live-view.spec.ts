import { test, expect, type Locator, type Page } from '@playwright/test'

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
// baseline is not pinned). An empty floor shows the "Nothing to show in 3D yet"
// empty-state rather than a blank canvas, so the canvas only mounts once a wall exists.
// The test first confirms that empty-state, then compares two STABLE canvas frames - one
// wall vs a second wall added - and requires them to differ, which catches both an
// unframed camera (geometry off-screen leaves both frames identically blank) and a view
// that never updates when the plan changes. Stability matters: an earlier version fired
// on a transient frame during canvas init and passed even on the unfixed view, so each
// frame is captured only once two consecutive screenshots match.

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

type Point = { x: number; y: number }

// Commits one wall run in the plan pane: arm the Wall tool, click the two endpoints, then
// press Enter so the buffered run commits.
async function drawWall(
  page: Page,
  plan: Locator,
  segment: { from: Point; to: Point },
): Promise<void> {
  await page.getByRole('button', { name: 'Wall', exact: true }).click()
  await plan.click({ position: segment.from })
  await plan.click({ position: segment.to })
  await page.keyboard.press('Enter')
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
    // An empty floor has no geometry, so the pane shows the empty-state and no canvas.
    await expect(pane.getByRole('heading', { name: /nothing to show in 3d yet/i })).toBeVisible()
    await expect(pane.locator('canvas')).toHaveCount(0)

    const plan = page.getByLabel('Floor plan')
    await expect(plan).toBeVisible()

    // The first wall gives the live view geometry, so the canvas mounts and frames it.
    await drawWall(page, plan, { from: { x: 100, y: 150 }, to: { x: 300, y: 150 } })
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)

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

    const oneWallFrame = await stableFrame(canvas)

    // A second, separate wall changes the plan, so the live view must re-frame and
    // re-render. A disjoint parallel run grows the framed bounds without sharing a vertex.
    await drawWall(page, plan, { from: { x: 100, y: 260 }, to: { x: 300, y: 260 } })
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(2)

    const twoWallFrame = await stableFrame(canvas)

    // The settled 3D frame must change once the live view reflects the new geometry.
    // On the unfixed view both frames are the identical render that never updated.
    expect(twoWallFrame.equals(oneWallFrame)).toBe(false)
  })
})
