import { test, expect } from '@playwright/test'
import { gotoEditor, selectWallTool } from './support'

test('Escape leaves a placement tool and returns to select', async ({ page }) => {
  await gotoEditor(page)
  const wallChip = page.getByRole('button', { name: 'Wall', exact: true })
  const selectChip = page.getByRole('button', { name: 'Select', exact: true })

  await selectWallTool(page)
  await expect(wallChip).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('Escape')

  await expect(selectChip).toHaveAttribute('aria-pressed', 'true')
  await expect(wallChip).toHaveAttribute('aria-pressed', 'false')
})
