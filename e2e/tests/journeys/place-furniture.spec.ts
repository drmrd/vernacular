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

test('keeps an inspector edit when a canvas click changes the selection', async ({ page }) => {
  await gotoEditor(page)

  // Drop a starter-pack chair at the plan center and select it so the furniture
  // inspector is editable.
  await page.getByRole('button', { name: 'Furniture' }).click()
  const chair = page.getByRole('button', { name: 'Example chair' })
  await expect(chair).toBeVisible()
  await chair.click()
  const box = await canvasBox(page)
  const drop = { x: box.width * 0.5, y: box.height * 0.5 }
  await selectors.planCanvas(page).click({ position: drop })
  await selectors.selectTool(page).click()
  await selectors.planCanvas(page).click({ position: drop })

  const angle = page.getByLabel('Angle')
  await expect(angle).toBeVisible()
  await expect(angle).toHaveValue('0')

  // Type a new absolute angle but do NOT press Enter. The dominant gesture is to
  // type a value and then click the plan, which is the edit that used to be lost.
  await angle.click()
  await angle.fill('45')

  // Click empty plan. The pointer-down blurs the field, committing the typed
  // value through the same path Enter uses, before the pointer-up clears the
  // selection and unmounts the editor.
  await selectors
    .planCanvas(page)
    .click({ position: { x: box.width * 0.85, y: box.height * 0.15 } })
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeHidden()

  // Re-select the piece: the committed rotation survived the canvas click, so the
  // reseeded editor shows the edited value rather than the original.
  await selectors.planCanvas(page).click({ position: drop })
  await expect(page.getByLabel('Angle')).toHaveValue('45')
})
