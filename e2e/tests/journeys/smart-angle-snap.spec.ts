import { test, expect } from '@playwright/test'
import { gotoEditor, selectors, selectWallTool } from './support'

test('locks a drawn wall to a square angle and frees it with the modifier', async ({ page }) => {
  await gotoEditor(page)
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)

  // Start a wall, then move toward a near-vertical point. The default lock squares the
  // drawn direction to a right angle, announces the lock for assistive technology, and
  // shows the live length-and-bearing readout chip.
  await canvas.click({ position: { x: 200, y: 360 } })
  await canvas.hover({ position: { x: 230, y: 120 } })
  await expect(selectors.liveRegion(page)).toHaveText(/Locked to (90|270) degrees/)
  await expect(selectors.drawReadout(page)).toContainText('°')

  // Holding the free-angle modifier releases the lock, so the live region no longer
  // reports a locked angle while the cursor moves.
  await page.keyboard.down('Alt')
  await canvas.hover({ position: { x: 236, y: 132 } })
  await expect(selectors.liveRegion(page)).not.toHaveText(/Locked to/)
  await page.keyboard.up('Alt')
})
