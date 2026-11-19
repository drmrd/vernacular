import { test, expect, type Page } from '@playwright/test'
import { expectWallCount, gotoEditor, selectWallTool, selectors } from './journeys/support'

const WALL_RUN_STEPS = 3

// Arm a tool from its chip, then move focus off the chip: a focused radio owns the
// arrow keys, so the window-level authoring keys would never see them.
async function armTool(page: Page, name: string): Promise<void> {
  await page.getByRole('radio', { name, exact: true }).click()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function pressRepeatedly(page: Page, key: string, times: number): Promise<void> {
  for (let press = 0; press < times; press += 1) {
    await page.keyboard.press(key)
  }
}

// Anchor a keyboard wall run, drop one vertex three grid steps along, and leave the
// run open for the next vertex.
async function openKeyboardWallRun(page: Page): Promise<void> {
  await page.keyboard.press('Enter')
  await pressRepeatedly(page, 'ArrowRight', WALL_RUN_STEPS)
  await page.keyboard.press('Enter')
  await expectWallCount(page, 1)
}

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

  test('Escape cancels an open keyboard wall run and keeps the Wall tool armed', async ({
    page,
  }) => {
    await gotoEditor(page)
    const live = selectors.liveRegion(page)
    const wallTool = page.getByRole('radio', { name: 'Wall', exact: true })
    await armTool(page, 'Wall')
    await openKeyboardWallRun(page)

    // A real Escape cancels the open run, says so, and leaves the Wall tool armed.
    await page.keyboard.press('Escape')
    await expect(live).toHaveText('Wall run cancelled')
    await expect(wallTool).toHaveAttribute('aria-checked', 'true')

    // The cancelled run is gone: the next Enter anchors a new one instead of
    // adding a wall from the old vertex.
    await page.keyboard.press('ArrowRight')
    await expect(live).toHaveText(/^Candidate at /)
    await page.keyboard.press('Enter')
    await expect(live).toHaveText('Wall vertex dropped')
    await expectWallCount(page, 1)

    // That run cancels the same way, and only the Escape after it leaves the tool.
    await page.keyboard.press('Escape')
    await expect(live).toHaveText('Wall run cancelled')
    await expect(wallTool).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('radio', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(wallTool).toHaveAttribute('aria-checked', 'false')
  })

  test('Escape cancels an open keyboard measurement and keeps the Dimension tool armed', async ({
    page,
  }) => {
    await gotoEditor(page)
    const live = selectors.liveRegion(page)
    await armTool(page, 'Dimension')

    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await expect(live).toHaveText('Candidate at 100, 0')

    await page.keyboard.press('Escape')
    await expect(live).toHaveText('Dimension cancelled')
    await expect(page.getByRole('radio', { name: 'Dimension', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // The new measurement starts where the candidate now is (200, 0), so one more
    // step measures 100 mm. A stale start at the origin would measure 200 or 300.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(live).toHaveText('Dimension measured 100 mm')
    await expect(selectors.dimensionProxies(page)).toHaveCount(1)
  })

  test('a keyboard wall run does not survive a change of tool', async ({ page }) => {
    await gotoEditor(page)
    const live = selectors.liveRegion(page)
    await armTool(page, 'Wall')
    await openKeyboardWallRun(page)

    // Leave the Wall tool by its chip and come back.
    await armTool(page, 'Select')
    await armTool(page, 'Wall')

    // The first Enter anchors a new run, so it adds no wall from the old vertex.
    await page.keyboard.press('ArrowRight')
    await expect(live).toHaveText(/^Candidate at /)
    await page.keyboard.press('Enter')
    await expect(live).toHaveText('Wall vertex dropped')
    await expectWallCount(page, 1)
  })
})
