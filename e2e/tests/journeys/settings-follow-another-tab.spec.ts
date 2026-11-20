import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, selectors } from './support'

// The themed wrapper exposes the resolved theme as an attribute, so the spec reads that
// rather than a color.
const themedShell = (page: Page) => page.locator('.design-system-theme')

async function chooseTheme(page: Page, name: 'Light' | 'Dark'): Promise<void> {
  await page
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name, exact: true })
    .click()
}

// A project is open in one tab at a time, so a second tab offers to start a new project
// instead. That tab then shows the editor, and its settings are the same stored settings.
async function openEditorInSecondTab(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('main', { name: 'Error' })
    .getByRole('button', { name: 'Start a new project' })
    .click()
  await expect(selectors.planCanvas(page)).toBeVisible()
}

test.use({ colorScheme: 'light' })

test('shows a theme chosen in one tab in the other open tab without a reload', async ({
  context,
}) => {
  // Both pages come from one context, so they share the stored settings, as two tabs of one
  // browser do. Each page is ready and shows the light theme before anything changes.
  const firstTab = await context.newPage()
  await gotoEditor(firstTab)
  const secondTab = await context.newPage()
  await openEditorInSecondTab(secondTab)
  await expect(themedShell(firstTab)).toHaveAttribute('data-theme', 'light')
  await expect(themedShell(secondTab)).toHaveAttribute('data-theme', 'light')

  await chooseTheme(firstTab, 'Dark')
  await expect(themedShell(firstTab)).toHaveAttribute('data-theme', 'dark')
  await expect(themedShell(secondTab)).toHaveAttribute('data-theme', 'dark')

  // The other direction: a change made in the second tab reaches the first one.
  await chooseTheme(secondTab, 'Light')
  await expect(themedShell(secondTab)).toHaveAttribute('data-theme', 'light')
  await expect(themedShell(firstTab)).toHaveAttribute('data-theme', 'light')
})
