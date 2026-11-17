import type { Locator, Page } from '@playwright/test'

// Locators of the live 3D pane that more than one journey needs.

// The live pane raises this once the stored session has been applied and a frame has drawn
// since the last render-pipeline build settled. It follows the render pipeline only, not the
// meshes the drawn room derives, so a journey also waits for a stable frame.
export const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

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
