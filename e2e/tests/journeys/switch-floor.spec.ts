import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, selectors } from './support'

test('switches floors and the canvas changes', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expect(selectors.wallProxies(page)).toHaveCount(1)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()
  await expect(selectors.wallProxies(page)).toHaveCount(0)
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.wallProxies(page)).toHaveCount(1)
})
