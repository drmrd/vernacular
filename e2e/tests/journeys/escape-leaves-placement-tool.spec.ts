import { test, expect } from '@playwright/test'
import { gotoEditor, selectWallTool } from './support'

test('Escape leaves a placement tool and returns to select', async ({ page }) => {
  await gotoEditor(page)
  const wallChip = page.getByRole('radio', { name: 'Wall', exact: true })
  const selectChip = page.getByRole('radio', { name: 'Select', exact: true })

  await selectWallTool(page)
  await expect(wallChip).toHaveAttribute('aria-checked', 'true')

  await page.keyboard.press('Escape')

  await expect(selectChip).toHaveAttribute('aria-checked', 'true')
  await expect(wallChip).toHaveAttribute('aria-checked', 'false')
})
