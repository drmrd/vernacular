import { test, expect, type Locator, type Page } from '@playwright/test'
import { webFontsSettled } from './journeys/support'
import { settledLiveFrame, waitForDrawnSceneChange } from './live-pane-frames'

// This exercises the editor's LIVE three-dimensional preview pane (`LiveSceneView`),
// not the deterministic `?fixture=scene-harness` render harness. It reproduces the
// user-reported bug: in Split view the 3D pane stays blank because the live view never
// frames its camera (React Three Fiber's default camera cannot contain the
// millimeter-scale scene) and never updates when the plan changes.
//
// It runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there) and self-skips when WebGPU is unavailable, because the spec is
// written for the WebGPU backend. A browser without WebGPU still mounts a canvas, which
// three draws through its WebGL 2 fallback; the pane shows no fallback message for it.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders
// through the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel
// baseline is not pinned). An empty floor keeps the canvas mounted under the
// "Nothing to show in 3D yet" guidance overlay, so the pane never tears down its
// rendering context (issue #602). The test first confirms that overlaid empty state, then compares two STABLE canvas frames - one
// wall vs a second wall added - and requires them to differ, which catches both an
// unframed camera (geometry off-screen leaves both frames identically blank) and a view
// that never updates when the plan changes. Stability matters: an earlier version fired
// on a transient frame during canvas init and passed even on the unfixed view, so each
// frame is captured only after the pane has drawn the scene revision the edit produced
// (data-drawn-revision) and two consecutive screenshots then match.

type Point = { x: number; y: number }

// The test draws two walls and takes a settled frame after each. A software renderer draws each
// frame slowly, and the default time limit is too short there.
const SLOW_RENDERER_TIMEOUT_MS = 120_000

// Commits one wall run in the plan pane: arm the Wall tool, click the two endpoints, then
// press Enter so the buffered run commits.
async function drawWall(
  page: Page,
  plan: Locator,
  segment: { from: Point; to: Point },
): Promise<void> {
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  await plan.click({ position: segment.from })
  await plan.click({ position: segment.to })
  await page.keyboard.press('Enter')
}

test.describe('Live three-dimensional preview pane', () => {
  test.beforeEach(() => test.setTimeout(SLOW_RENDERER_TIMEOUT_MS))

  test('reflects a drawn wall in the split-view 3D pane', async ({ page }) => {
    await page.goto('/')
    await webFontsSettled(page)

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    // Split view keeps the plan and the 3D pane mounted together, so drawing a wall and
    // the 3D pane reacting happen without a remount (which is the user's scenario).
    await page.getByRole('button', { name: 'Split view' }).click()

    const pane = page.getByRole('region', { name: /3d preview/i })
    // An empty floor has no geometry, so the pane shows the guidance overlay while the
    // canvas stays mounted beneath it.
    await expect(pane.getByRole('heading', { name: /nothing to show in 3d yet/i })).toBeVisible()
    await expect(pane.locator('canvas')).toHaveCount(1)

    const plan = page.getByLabel('Floor plan')
    await expect(plan).toBeVisible()

    // The first wall gives the live view geometry, so the canvas frames it. The pane has drawn
    // the wall once a counted frame carries a later scene revision than the empty floor had.
    await waitForDrawnSceneChange(page, async () => {
      await drawWall(page, plan, { from: { x: 100, y: 150 }, to: { x: 300, y: 150 } })
      await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)
    })
    const oneWallFrame = await settledLiveFrame(page)

    // A second, separate wall changes the plan, so the live view must re-frame and
    // re-render. A disjoint parallel run grows the framed bounds without sharing a vertex.
    await waitForDrawnSceneChange(page, async () => {
      await drawWall(page, plan, { from: { x: 100, y: 260 }, to: { x: 300, y: 260 } })
      await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(2)
    })
    const twoWallFrame = await settledLiveFrame(page)

    // The settled 3D frame must change once the live view reflects the new geometry.
    // On the unfixed view both frames are the identical render that never updated.
    expect(twoWallFrame.equals(oneWallFrame)).toBe(false)
  })
})
