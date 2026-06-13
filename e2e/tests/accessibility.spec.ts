import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Home page accessibility', () => {
  test('has no axe-core violations on initial render', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('lets a keyboard user focus a plan entity proxy and select it', async ({ page }) => {
    await page.goto('/')
    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    // Draw a wall so the overlay exposes a selectable entity.
    await page.getByRole('button', { name: 'Draw wall' }).click()
    await canvas.click({ position: { x: 120, y: 200 } })
    await canvas.click({ position: { x: 520, y: 200 } })
    // Finish the run with Enter so the buffered wall commits.
    await page.keyboard.press('Enter')
    await expect(page.getByText('Walls: 1')).toBeVisible()

    // The wall is reachable as a keyboard-focusable option whose accessible name is
    // the unit-aware label: "Wall, <length>" formatted in the project's units.
    const proxy = page.getByRole('option', { name: /^Wall,/ })
    await expect(proxy).toHaveAttribute('aria-label', /^Wall, .*\d/)
    await expect(proxy).toHaveAttribute('tabindex', '0')

    // A keyboard user focuses the proxy and selects it with Enter.
    await proxy.focus()
    await expect(proxy).toBeFocused()
    await page.keyboard.press('Enter')

    // Selection is reflected on the proxy and drives the inspector.
    await expect(proxy).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
  })
})
