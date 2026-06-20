import { test, expect } from '@playwright/test'

test.describe('Keyboard plan authoring', () => {
  test('authors a wall using only the keyboard', async ({ page }) => {
    await page.goto('/')
    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    // Activate the Wall tool, then move focus off the tool button so the
    // window-level authoring keys are not swallowed by the focused control.
    await page.getByRole('button', { name: 'Wall', exact: true }).click()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

    // The candidate marker appears once a creative tool is active, showing where
    // the next vertex will land. It is absent under the select tool (verified by
    // the home visual-regression baseline holding).
    await expect(page.getByTestId('plan-authoring-candidate')).toBeVisible()

    // Author a wall entirely from the keyboard: anchor the first vertex at the
    // seeded candidate, nudge the candidate a few grid steps, drop the second
    // vertex, then a second Enter on the same point finishes the run.
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    // A wall now exists, reachable as a keyboard-focusable entity proxy whose
    // accessible name is the unit-aware "Wall, <length>" label.
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)

    // Each authoring step was announced through the shared live region.
    await expect(page.locator('.plan-overlay__live')).toHaveText(/wall|vertex|finish/i)
  })
})
