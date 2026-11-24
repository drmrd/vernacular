import { test, expect, type Locator, type Page } from '@playwright/test'
import { webFontsSettled } from './journeys/support'
import { waitForLiveViewReady } from './live-pane'
import { liveSceneCanvas } from './live-pane-frames'
import { drawnSceneCanvas } from './scene-helpers'

// Issue #666 and ADR-0174: the live three-dimensional pane has three branches, and the neighbouring
// live-view specs run the first one (WebGPU) wherever a real adapter exists. This spec pins the other
// two. With no WebGPU the pane draws through three's WebGL 2 backend and shows a dismissible notice
// that the shading can differ. With neither WebGPU nor a WebGL 2 context the pane says the preview
// is unavailable and mounts no canvas.
//
// The spec forces each branch itself, so it does not depend on what the runner offers. An init script
// runs before any app module and removes `navigator.gpu` from the Navigator prototype (Chromium
// defines it there as a configurable accessor). Each test then asserts that the removal took effect,
// so a removal that failed fails the test and cannot pass on the WebGPU branch. The probe in
// engine/renderer/detect-backend.ts caches its answer for the page, and every test opens a fresh
// page, so the cache does not leak between tests.
//
// The file name carries the `scene-` prefix, so the Playwright config routes it to the scene-webgl
// project, and the linux scene job runs it on SwiftShader, which provides a WebGL 2 context.

const NOTICE_TEXT = 'The 3D preview is running without WebGPU.'

// Removes WebGPU before any page script runs, so the engine probe and three's renderer both see a
// browser without the API.
async function withoutWebGpu(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'gpu')
  })
}

// Removes WebGPU and refuses every WebGL 2 context. The wrapper calls through for any other context
// id, so the 2D plan canvas still draws.
async function withoutAnyGpuContext(page: Page): Promise<void> {
  await withoutWebGpu(page)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (args[0] === 'webgl2') return null
      return Reflect.apply(original, this, args)
    } as typeof original
  })
}

// Opens the editor and fails fast when the removal of navigator.gpu did not take effect.
async function openWithoutWebGpu(page: Page): Promise<void> {
  await page.goto('/')
  await webFontsSettled(page)
  const hasGpu = await page.evaluate(() => 'gpu' in navigator)
  expect(hasGpu, 'the init script must have removed navigator.gpu').toBe(false)
}

function previewRegion(page: Page): Locator {
  return page.getByRole('region', { name: /3d preview/i })
}

test.describe('Live three-dimensional preview without WebGPU', () => {
  test('draws the live 3D view and says why it may look different', async ({ page }) => {
    await withoutWebGpu(page)
    await openWithoutWebGpu(page)

    await drawnSceneCanvas(page)

    // Other status elements share the region (the temperature readout, the selection readout), so
    // the notice is the status that carries its text.
    const notice = previewRegion(page).getByRole('status').filter({ hasText: NOTICE_TEXT })
    await expect(notice).toBeVisible()
  })

  test('hides the notice when it is dismissed and keeps the view running', async ({ page }) => {
    await withoutWebGpu(page)
    await openWithoutWebGpu(page)
    await drawnSceneCanvas(page)
    const region = previewRegion(page)
    await expect(region.getByText(NOTICE_TEXT)).toBeVisible()

    await region.getByRole('button', { name: 'Dismiss notification' }).click()

    await expect(region.getByText(NOTICE_TEXT)).toBeHidden()
    await expect(liveSceneCanvas(page)).toBeVisible()
    await waitForLiveViewReady(page)
  })

  test('says the preview is unavailable when no WebGL 2 context exists either', async ({
    page,
  }) => {
    await withoutAnyGpuContext(page)
    await openWithoutWebGpu(page)

    await page.getByRole('button', { name: 'Split view' }).click()

    await expect(
      previewRegion(page).getByRole('heading', { name: '3D preview unavailable' }),
    ).toBeVisible()
    await expect(page.getByTestId('live-scene-canvas')).toHaveCount(0)
  })
})
