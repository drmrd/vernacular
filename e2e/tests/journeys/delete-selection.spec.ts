import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('deletes the selected entities', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await selectors.selectTool(page).click()
  const proxy = selectors.wallProxy(page)
  await proxy.focus()
  await page.keyboard.press('Enter')
  await expect(proxy).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Delete')
  await expectWallCount(page, 0)
})
