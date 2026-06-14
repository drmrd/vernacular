import { test, expect } from '@playwright/test'

import { drawWall, gotoEditor, selectors } from './support'

test('pastes onto the active non-ground floor, not the ground floor', async ({ page }) => {
  await gotoEditor(page)

  // Draw a wall on the ground floor, select it, and copy it.
  await drawWall(page, { x: 150, y: 200 }, { x: 480, y: 200 })
  await expect(selectors.wallProxies(page)).toHaveCount(1)
  await selectors.selectTool(page).click()
  await selectors.planCanvas(page).click({ position: { x: 300, y: 200 } })
  await page.keyboard.press('ControlOrMeta+c')

  // Switch to a new floor and paste.
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()
  await expect(selectors.wallProxies(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+v')

  // The paste lands on the active (new) floor, so it shows here.
  await expect(selectors.wallProxies(page)).toHaveCount(1)

  // And the ground floor still holds only the original, not the paste.
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.wallProxies(page)).toHaveCount(1)
})
