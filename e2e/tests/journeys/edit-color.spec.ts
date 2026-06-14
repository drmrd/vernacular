import { test, expect } from '@playwright/test'
import { gotoEditor, selectWallTool, selectors } from './support'

// Paint is contextual: selecting a wall reveals its finish section (Face A/B) with
// the bound color picker. Picking a palette color dispatches the assignment, and the
// finish picker then appears (it renders only once the surface has a solid
// treatment), proving the edit applied end to end.
test('edits a wall face color via the contextual finish section', async ({ page }) => {
  await gotoEditor(page)

  // Draw a wall so there is a surface to paint.
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: 120, y: 200 } })
  await canvas.click({ position: { x: 520, y: 200 } })
  await page.keyboard.press('Enter')

  // Select the wall through its accessibility proxy.
  await selectors.selectTool(page).click()
  const proxy = page.getByRole('option', { name: /^Wall,/ })
  await proxy.focus()
  await page.keyboard.press('Enter')
  await expect(proxy).toHaveAttribute('aria-selected', 'true')

  // The contextual finish section appears for the selected wall.
  await expect(page.getByRole('group', { name: /wall face/i })).toBeVisible()

  // Picking a bundled palette color assigns a solid treatment, revealing the finish
  // picker radios.
  await page.getByRole('button', { name: 'Sage Green' }).click()
  await expect(page.getByRole('radio').first()).toBeVisible()
})
