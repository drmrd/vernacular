import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

// Opening proxies read through their accessible label, which ends in "wide"
// (e.g. "Single Swing Door, 900 mm wide"), so they are distinct from the wall,
// room, and dimension proxies the overlay also renders.
const openingProxies = (page: Page) => page.getByRole('option', { name: / wide$/ })

test('a wall cannot host on an opening', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)

  // The door chip arms opening placement, which hosts on a wall: clicking on the
  // wall places one opening.
  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await selectors.planCanvas(page).click({ position: { x: 320, y: 200 } })
  await expect(openingProxies(page)).toHaveCount(1)

  // A point clear of every wall hosts nothing: no second opening appears, because
  // the host of an opening is always a wall and never another opening or empty space.
  await selectors.planCanvas(page).click({ position: { x: 320, y: 420 } })
  await expect(openingProxies(page)).toHaveCount(1)
})
