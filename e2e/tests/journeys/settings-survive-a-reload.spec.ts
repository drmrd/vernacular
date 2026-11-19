import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, selectors } from './support'

const THEME_KEY = 'vernacular.settings.theme'
const SNAP_PREFERENCES_KEY = 'vernacular.settings.snapPreferences'
const OLDER_SNAP_PREFERENCES_KEY = 'vernacular.snap-preferences'

// The text that an older build stored: the preferences as JSON, with the grid kind off and a
// catch radius that differs from the default, so the carried value is plainly the stored one.
const OLDER_SNAP_PREFERENCES_TEXT = JSON.stringify({
  enabled: true,
  kinds: {
    endpoint: true,
    intersection: true,
    midpoint: true,
    edge: true,
    angle: true,
    perpendicular: true,
    parallel: true,
    grid: false,
    trace: false,
  },
  pixelRadius: 14,
})

// The themed wrapper exposes the resolved theme as an attribute, so the specs read that
// rather than a color.
const themedShell = (page: Page) => page.locator('.design-system-theme')

const storedText = (page: Page, key: string) =>
  page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)

// Reload the page and wait until the editor is ready again.
async function reloadEditor(page: Page): Promise<void> {
  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
}

test.use({ colorScheme: 'light' })

test('keeps the chosen theme after a reload', async ({ page }) => {
  await gotoEditor(page)
  await expect(themedShell(page)).toHaveAttribute('data-theme', 'light')

  await page
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark', exact: true })
    .click()
  await expect(themedShell(page)).toHaveAttribute('data-theme', 'dark')

  await reloadEditor(page)
  await expect(themedShell(page)).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => storedText(page, THEME_KEY)).toBe('"dark"')
})

test('keeps the snap preferences that an older build stored', async ({ page }) => {
  // The first start finds nothing stored. The older text is then put in place from inside
  // the page, once, and only the reload that follows can see it: no script runs again at
  // that load, so nothing can restore the older key after the application has carried it.
  await gotoEditor(page)
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    OLDER_SNAP_PREFERENCES_KEY,
    OLDER_SNAP_PREFERENCES_TEXT,
  ] as const)
  expect(await storedText(page, SNAP_PREFERENCES_KEY)).toBeNull()

  await reloadEditor(page)

  await page.getByRole('button', { name: /^Snap/ }).click()
  await expect(page.getByRole('checkbox', { name: 'Grid' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Midpoint' })).toBeChecked()
  expect(await storedText(page, OLDER_SNAP_PREFERENCES_KEY)).toBeNull()
  expect(await storedText(page, SNAP_PREFERENCES_KEY)).toBe(OLDER_SNAP_PREFERENCES_TEXT)
})
