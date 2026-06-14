import { test, expect } from '@playwright/test'

test.describe('Wall-drawing proof of life', () => {
  test('draws a wall, autosaves it, and restores it after reload', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    await page.getByRole('button', { name: 'Wall', exact: true }).click()
    await canvas.click({ position: { x: 120, y: 200 } })
    await canvas.click({ position: { x: 520, y: 200 } })
    // Finish the run with Enter so the buffered wall commits.
    await page.keyboard.press('Enter')

    await expect(page.getByText('All changes saved')).toBeVisible()
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)

    await page.reload()

    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)

    await page.getByRole('button', { name: 'Select' }).click()
    await page.getByLabel('Floor plan').click({ position: { x: 320, y: 200 } })
    await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
  })
})
