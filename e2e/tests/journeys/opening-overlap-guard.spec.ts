import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

// Opening proxies read through their accessible label, which ends in "wide"
// (e.g. "Single Swing Door, 900 mm wide").
const openingProxies = (page: Page) => page.getByRole('option', { name: / wide$/ })

test('a door cannot be placed on top of another door', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)

  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await selectors.planCanvas(page).click({ position: { x: 320, y: 200 } })
  await expect(openingProxies(page)).toHaveCount(1)

  // A second door dropped on the same spot would overlap the first, which is not
  // a buildable wall, so the placement is blocked and no second opening appears.
  await selectors.planCanvas(page).click({ position: { x: 320, y: 200 } })
  await expect(openingProxies(page)).toHaveCount(1)
})
