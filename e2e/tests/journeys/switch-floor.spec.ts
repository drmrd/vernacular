import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, selectWallTool, expectWallCount, selectors } from './support'

const FIRST_CORNER = { x: 160, y: 200 }
const SECOND_CORNER = { x: 360, y: 200 }
const NEW_RUN_POINT = { x: 360, y: 400 }
const GROUND_FLOOR = 'Ground'
const UPPER_FLOOR = '2nd Floor'

test('switches floors and the canvas changes', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expect(selectors.wallProxies(page)).toHaveCount(1)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, '2nd Floor').click()
  await expect(selectors.wallProxies(page)).toHaveCount(0)
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.wallProxies(page)).toHaveCount(1)
})

test('ends an open wall run when the floor changes', async ({ page }) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, GROUND_FLOOR).click()
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: FIRST_CORNER })
  await canvas.click({ position: SECOND_CORNER })
  await expectWallCount(page, 1)

  await selectors.floorButton(page, UPPER_FLOOR).click()
  await canvas.hover({ position: NEW_RUN_POINT })
  await expect(selectors.drawReadout(page)).toHaveCount(0)

  await canvas.click({ position: NEW_RUN_POINT })
  await expectWallCount(page, 0)

  await selectors.floorButton(page, GROUND_FLOOR).click()
  await expectWallCount(page, 1)
})
