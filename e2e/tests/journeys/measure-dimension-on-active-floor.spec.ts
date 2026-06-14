import { test, expect } from '@playwright/test'

import { gotoEditor, selectors } from './support'

test('measures a dimension on the active non-ground floor, not the ground floor', async ({
  page,
}) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()

  await page.getByRole('button', { name: 'Dimension', exact: true }).click()
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: 150, y: 220 } })
  await canvas.click({ position: { x: 480, y: 220 } })

  // The dimension belongs to the active (new) floor, so it shows here.
  await expect(selectors.dimensionProxies(page)).toHaveCount(1)

  // And it is not on the ground floor.
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.dimensionProxies(page)).toHaveCount(0)
})
