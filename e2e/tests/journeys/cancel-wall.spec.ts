import { test } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors } from './support'

test('cancels a half-drawn wall with the cancel key', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: 120, y: 200 } }) // start a wall
  await page.keyboard.press('Escape') // cancel the in-progress wall
  await canvas.click({ position: { x: 520, y: 200 } }) // a fresh first click, not the end
  await expectWallCount(page, 0) // nothing was committed
})
