import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

import { gotoEditor, selectors } from './support'

const underlayFixture = fileURLToPath(new URL('../../fixtures/underlay.png', import.meta.url))

test('draws the active non-ground floor reference image on the plan canvas', async ({ page }) => {
  await gotoEditor(page)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()

  const snapshot = (): Promise<string> =>
    selectors.planCanvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL())
  const beforeLoad = await snapshot()

  // The underlay controls live in a launcher pinned to the tool rail; open it to load.
  await page.getByRole('button', { name: 'Underlay' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Load image' }).click()
  await (await chooser).setFiles(underlayFixture)

  // The image now belongs to the active (new) floor's model. Selecting Load image
  // closes the flyout, so reopen the launcher to see the row.
  await page.getByRole('button', { name: 'Underlay' }).click()
  await expect(page.getByRole('group', { name: 'Underlay 1' })).toBeVisible()

  // The active floor's reference image must draw on the plan canvas, so it changes.
  // Failing would mean the underlay layer still resolves the first floor, leaving a
  // non-ground floor's image filtered out and the canvas unchanged.
  await expect.poll(snapshot).not.toBe(beforeLoad)
})
