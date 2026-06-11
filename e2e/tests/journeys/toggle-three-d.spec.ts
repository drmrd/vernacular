import { test, expect } from '@playwright/test'
import { gotoEditor, selectors } from './support'

test('toggles between the two- and three-dimensional views', async ({ page }) => {
  await gotoEditor(page)
  await expect(selectors.threeDRegion(page)).toHaveCount(0)
  await selectors.viewModeButton(page, '3D view').click()
  await expect(selectors.threeDRegion(page)).toBeVisible()
  await selectors.viewModeButton(page, 'Plan view').click()
  await expect(selectors.threeDRegion(page)).toHaveCount(0)
})
