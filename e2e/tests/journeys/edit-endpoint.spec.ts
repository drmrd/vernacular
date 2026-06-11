import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('re-edits a wall endpoint after placement', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)

  // Select the wall through its accessible plan proxy so its endpoint handles arm.
  await selectors.selectTool(page).click()
  const proxy = selectors.wallProxy(page)
  await proxy.focus()
  await page.keyboard.press('Enter')
  await expect(proxy).toHaveAttribute('aria-selected', 'true')
  const before = await proxy.getAttribute('aria-label')

  // Drag the right-hand endpoint (placed at screen 520,200) down to 520,400.
  const box = await selectors.planCanvas(page).boundingBox()
  if (box === null) {
    throw new Error('plan canvas has no bounding box')
  }
  await page.mouse.move(box.x + 520, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 520, box.y + 300, { steps: 5 })
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 })
  await page.mouse.up()

  // The wall is still present but its length (and so its accessible label) changed.
  await expectWallCount(page, 1)
  await expect(selectors.wallProxy(page)).not.toHaveAttribute('aria-label', before ?? '')
})
