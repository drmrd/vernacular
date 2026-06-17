import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import { canvasBox, gotoEditor, selectors } from './support'

test('places a starter-pack furniture piece and edits it in the inspector', async ({ page }) => {
  await gotoEditor(page)

  // Open the furniture library launcher pinned in the tool rail.
  await page.getByRole('button', { name: 'Furniture' }).click()

  // The bundled starter pack lists its one chair once the registry resolves.
  const chair = page.getByRole('button', { name: 'Example chair' })
  await expect(chair).toBeVisible()

  // The open library panel itself has no accessibility violations.
  const audit = await new AxeBuilder({ page }).include('[aria-label="Furniture library"]').analyze()
  expect(audit.violations).toEqual([])

  // Picking the chair arms it and switches to the place-furniture tool; clicking
  // the plan drops a piece centered on the cursor.
  await chair.click()
  const box = await canvasBox(page)
  const drop = { x: box.width * 0.5, y: box.height * 0.5 }
  await selectors.planCanvas(page).click({ position: drop })

  // Select it back: the select tool plus a click where it was dropped lands on the
  // footprint, proving the piece placed and is hit-testable.
  await selectors.selectTool(page).click()
  await selectors.planCanvas(page).click({ position: drop })

  // The inspector shows the furniture editor, so a selected piece is editable.
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeVisible()
  await expect(page.getByLabel('Width')).toBeVisible()
  await expect(page.getByLabel('Angle')).toBeVisible()
})
