import { test } from '@playwright/test'
import { drawWall, expectWallCount, gotoEditor } from './support'

test.describe('Journey: draw a wall', () => {
  test('draws a wall and shows it on the plan', async ({ page }) => {
    await gotoEditor(page)
    await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
    await expectWallCount(page, 1)
  })
})
