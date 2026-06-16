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

  // The underlay controls live in a launcher pinned to the tool rail; open it to load.
  await page.getByRole('button', { name: 'Underlay' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Load image' }).click()
  await (await chooser).setFiles(underlayFixture)

  // The reference image is placed on the active (new) floor, so its row shows in the flyout.
  // Selecting Load image closes the flyout, so reopen the launcher to see the row.
  await page.getByRole('button', { name: 'Underlay' }).click()
  await expect(page.getByRole('group', { name: 'Underlay 1' })).toBeVisible()

  // And it is not on the ground floor.
  await selectors.floorButton(page, 'Ground').click()
  await page.getByRole('button', { name: 'Underlay' }).click()
  await expect(page.getByRole('group', { name: 'Underlay 1' })).toHaveCount(0)
})
