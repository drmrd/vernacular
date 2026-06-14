import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

import { gotoEditor, selectors } from './support'

const underlayFixture = fileURLToPath(new URL('../../fixtures/underlay.png', import.meta.url))

test('loads a reference image onto the active non-ground floor, not the ground floor', async ({
  page,
}) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load image' }).click()
  await (await chooser).setFiles(underlayFixture)

  // The reference image is placed on the active (new) floor, so its panel row shows here.
  await expect(page.getByRole('group', { name: 'Underlay 1' })).toBeVisible()

  // And it is not on the ground floor.
  await selectors.floorButton(page, 'Ground').click()
  await expect(page.getByRole('group', { name: 'Underlay 1' })).toHaveCount(0)
})
