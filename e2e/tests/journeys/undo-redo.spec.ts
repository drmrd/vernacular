import { test } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount } from './support'

test('undoes and redoes a wall', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expectWallCount(page, 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expectWallCount(page, 1)
})
