import { expect, type Locator, type Page } from '@playwright/test'

// Locators of the live 3D pane that more than one journey needs.

// The live pane raises this once the stored session has been applied, the ground grass has
// settled (loaded or failed), and a frame has drawn since the last render-pipeline build settled.
// It follows the render pipeline only, not the meshes the drawn room derives, so a journey also
// waits for a stable frame.
const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

// How long the ready marker may take. It now also waits for the grass to be fetched, decoded,
// uploaded with its mipmaps, and drawn, which is slow on a software renderer, so this is generous
// margin, not a measured wait. It is well above the default expect timeout (5 s) these waits
// used before.
const LIVE_VIEW_READY_TIMEOUT_MS = 20_000

/** Waits until the live pane raises its ready marker (data-live-view-ready="true"). */
export async function waitForLiveViewReady(page: Page): Promise<void> {
  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached({
    timeout: LIVE_VIEW_READY_TIMEOUT_MS,
  })
}

export function inspectorOf(page: Page): Locator {
  return page.getByRole('complementary', { name: /inspector/i })
}

// The 3D pane holds two status-role nodes (the color-temperature readout and the selection
// live region), so scope to the selection one by its vocabulary, as scene-selection.spec.ts does.
export function selectionStatusOf(page: Page): Locator {
  return page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('status')
    .filter({ hasText: /No entity selected|^Selected: / })
}
