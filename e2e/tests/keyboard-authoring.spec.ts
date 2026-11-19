import { test, expect } from '@playwright/test'
import { expectWallCount, gotoEditor, selectWallTool, selectors } from './journeys/support'

test.describe('Keyboard plan authoring', () => {
  test('authors a wall using only the keyboard', async ({ page }) => {
    await page.goto('/')
    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    // Activate the Wall tool, then move focus off the tool button so the
    // window-level authoring keys are not swallowed by the focused control.
    await page.getByRole('radio', { name: 'Wall', exact: true }).click()
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

  test('selects a focused wall on Enter and places no door under the Door tool', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()

    // Author a wall from the keyboard, as the journey above does.
    await page.getByRole('radio', { name: 'Wall', exact: true }).click()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    const wall = page.getByRole('option', { name: /^Wall,/ })
    await expect(wall).toHaveCount(1)

    // Arm the Door tool, then move focus onto the wall's proxy.
    await page.getByRole('radio', { name: 'Door', exact: true }).click()
    await wall.focus()
    await expect(wall).toBeFocused()

    // One Enter on the proxy only selects the wall: the keyboard drop of the Door
    // tool does not run, so no door lands and no refusal notice appears.
    await page.keyboard.press('Enter')

    // A zero count can be true before the key press has had any effect, so wait
    // for the selection first and only then check that nothing was placed.
    await expect(wall).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(0)
    await expect(page.locator('.plan-overlay__refusal')).toHaveCount(0)
  })

  test('keeps a pointer wall run open when Enter selects a focused wall', async ({ page }) => {
    await gotoEditor(page)
    const canvas = selectors.planCanvas(page)

    // Draw one wall with the pointer: the run stays open for the next corner.
    await selectWallTool(page)
    await canvas.click({ position: { x: 120, y: 200 } })
    await canvas.click({ position: { x: 520, y: 200 } })
    await expectWallCount(page, 1)

    // Enter on the wall's proxy only selects the wall. It must not finish the run.
    const wall = selectors.wallProxy(page)
    await wall.focus()
    await expect(wall).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(wall).toHaveAttribute('aria-selected', 'true')

    // The run went on, so the next corner chains a second wall.
    await canvas.click({ position: { x: 520, y: 400 } })

    await expectWallCount(page, 2)
  })
})
