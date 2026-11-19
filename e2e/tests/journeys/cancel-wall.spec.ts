import { expect, test } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors, selectWallTool } from './support'

test('cancels a half-drawn wall with the cancel key', async ({ page }) => {
  await gotoEditor(page)
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: 120, y: 200 } }) // start a wall
  await page.keyboard.press('Escape') // cancel the in-progress wall
  await canvas.click({ position: { x: 520, y: 200 } }) // a fresh first click, not the end
  await expectWallCount(page, 0) // nothing was committed
})

const OLD_RUN_START = { x: 160, y: 200 }
const OLD_RUN_CORNER = { x: 360, y: 200 }
const NEW_RUN_START = { x: 360, y: 400 }

test('ends an open wall run when another tool is chosen', async ({ page }) => {
  await gotoEditor(page)
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: OLD_RUN_START }) // first corner
  await canvas.click({ position: OLD_RUN_CORNER }) // one wall; the run goes on
  await expectWallCount(page, 1)
  await selectors.selectTool(page).click() // another tool ends the run
  await selectWallTool(page)
  await canvas.hover({ position: NEW_RUN_START })
  await expect(selectors.drawReadout(page)).toHaveCount(0) // no rubber band from the old corner
  await canvas.click({ position: NEW_RUN_START }) // a fresh first click, not a second wall
  await expectWallCount(page, 1)
})
