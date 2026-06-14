import { test, expect } from '@playwright/test'

import { canvasBox, drawWall, expectWallCount, gotoEditor, selectors } from './support'

test('moves a selected wall on the active non-ground floor', async ({ page }) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()

  const box = await canvasBox(page)
  const x0 = box.width * 0.35
  const yTop = box.height * 0.3
  const yBottom = box.height * 0.6
  const yMid = (yTop + yBottom) / 2

  // A vertical wall on the new floor, so a horizontal drag moves it to an empty column.
  await drawWall(page, { x: x0, y: yTop }, { x: x0, y: yBottom })
  await expectWallCount(page, 1)

  await selectors.selectTool(page).click()
  await selectors.planCanvas(page).click({ position: { x: x0, y: yMid } })

  // Drag the selected wall to the right by a known amount.
  const delta = box.width * 0.25
  const sx = box.x + x0
  const sy = box.y + yMid
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + delta, sy, { steps: 10 })
  await page.mouse.up()

  // Clicking the column it was dragged to selects the wall, proving the move
  // committed on the active floor. Otherwise the translate targets the empty
  // ground floor, the wall never moves, and this click selects nothing.
  await selectors.planCanvas(page).click({ position: { x: x0 + delta, y: yMid } })
  await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
})
