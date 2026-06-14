import { test, expect } from '@playwright/test'

import { drawWall, gotoEditor, selectors } from './support'

test('draws a wall on the active non-ground floor, not the ground floor', async ({ page }) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()

  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })

  // The wall belongs to the active (new) floor, so it shows here.
  await expect(selectors.wallProxies(page)).toHaveCount(1)

  // And it is not on the ground floor.
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.wallProxies(page)).toHaveCount(0)
})
