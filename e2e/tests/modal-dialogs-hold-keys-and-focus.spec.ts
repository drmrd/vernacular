import { test, expect, type Locator, type Page } from '@playwright/test'

// While a modal dialog is open, focus stays inside it and the editor's global shortcuts
// do nothing. The unit tests prove this in jsdom, which cannot show two facts the fix
// relies on: that the app renders inside document.body, so that the key listener the
// dialog puts on the body sees a key after React's own handlers and before the editor's
// listeners on the window; and that cancelling the default of a mousedown keeps focus
// where it was. Both are browser behavior, so this spec checks them in a real browser.
//
// The editor key used to show that the editor is held back is "2", which switches to the
// split view. Unlike the arrow keys it is not a key that a focused button owns, so the
// editor would act on it whenever the dialog let it through. Every test that expects the
// editor to stand still has a control that shows the key does change the view otherwise.

const PALETTE_SHORTCUT = 'ControlOrMeta+k'
const SPLIT_VIEW_KEY = '2'
const CORNER = { x: 5, y: 5 }
const TABS_TO_TRY = 4

const paletteOf = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })
// Scoped to the view switcher: the open palette lists a command of the same name.
const splitViewButton = (page: Page) =>
  page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Split view' })

// Describes what holds focus, and whether that element is inside the container.
async function describeFocus(
  dialog: Locator,
): Promise<{ summary: string; inside: boolean; heldByContainer: boolean }> {
  return dialog.evaluate((container) => {
    const active = document.activeElement
    if (active === null) {
      return { summary: 'nothing', inside: false, heldByContainer: false }
    }
    const name = active.getAttribute('aria-label') ?? active.textContent?.trim() ?? ''
    return {
      summary: `<${active.tagName.toLowerCase()}> "${name}"`,
      inside: container.contains(active),
      heldByContainer: container === active,
    }
  })
}

async function openDiscardPrompt(page: Page): Promise<{ prompt: Locator; opener: Locator }> {
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
  const planted = await page.evaluate(() => window.vernacularE2eStorage!.plantRecoverySnapshot())
  expect(planted).toBe(true)

  await page.goto('/')
  const banner = page.getByRole('alert').filter({ hasText: /unsaved changes were recovered/i })
  await expect(banner).toBeVisible()
  const opener = banner.getByRole('button', { name: 'Delete recovered copy' })
  await opener.click()

  const prompt = page.getByRole('alertdialog')
  await expect(prompt).toBeVisible()
  await expect(prompt.getByRole('button', { name: 'Cancel' })).toBeFocused()
  return { prompt, opener }
}

async function openPalette(page: Page): Promise<Locator> {
  await page.goto('/')
  await expect(page.getByLabel('Floor plan')).toBeVisible()
  await page.keyboard.press(PALETTE_SHORTCUT)
  const palette = paletteOf(page)
  await expect(palette).toBeVisible()
  await expect(palette.getByRole('textbox', { name: 'Search commands' })).toBeFocused()
  return palette
}

test.describe('Controls with no dialog open', () => {
  test('the palette shortcut opens the command palette', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(paletteOf(page)).toHaveCount(0)

    await page.keyboard.press(PALETTE_SHORTCUT)

    await expect(paletteOf(page)).toBeVisible()
  })

  test('the split view key switches the view', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.press(SPLIT_VIEW_KEY)

    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('The discard prompt holds the keys and the focus', () => {
  test.beforeEach(({ browserName }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so it cannot write the planted snapshot (same limitation as crash-recovery).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')
  })

  test('the editor shortcuts do nothing behind it', async ({ page }) => {
    const { prompt } = await openDiscardPrompt(page)
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.press(PALETTE_SHORTCUT)
    await page.keyboard.press(SPLIT_VIEW_KEY)

    await expect(paletteOf(page)).toHaveCount(0)
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(prompt).toBeVisible()
    await expect(prompt.getByRole('button', { name: 'Cancel' })).toBeFocused()
  })

  test('a click on its shade and the Tab key leave focus inside it, and Escape returns it to the opener', async ({
    page,
  }) => {
    const { prompt, opener } = await openDiscardPrompt(page)

    // The prompt's focus container is its shade, the element around the panel, so that a
    // press on the shade or on the panel's text lands on the container, not on the body.
    const shade = prompt.locator('xpath=..')

    await page.mouse.click(CORNER.x, CORNER.y)

    await expect(prompt).toBeVisible()
    const afterShadeClick = await describeFocus(shade)
    expect(afterShadeClick.inside, `focus was on ${afterShadeClick.summary}`).toBe(true)
    expect(afterShadeClick.heldByContainer, 'focus is on the shade itself').toBe(true)

    await page.keyboard.press('Shift+Tab')
    expect((await describeFocus(shade)).inside).toBe(true)
    for (let press = 0; press < TABS_TO_TRY; press += 1) {
      await page.keyboard.press('Tab')
      const afterTab = await describeFocus(shade)
      expect(afterTab.inside, `Tab ${press + 1} left focus on ${afterTab.summary}`).toBe(true)
    }

    await page.keyboard.press('Escape')

    await expect(prompt).toBeHidden()
    await expect(opener).toBeFocused()
  })
})

test.describe('The command palette holds the keys and the focus', () => {
  test('stays open on a click on its shade, keeps focus in its search field, and holds the editor back', async ({
    page,
  }) => {
    const palette = await openPalette(page)
    const search = palette.getByRole('textbox', { name: 'Search commands' })
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')

    await page.mouse.click(CORNER.x, CORNER.y)

    await expect(palette).toBeVisible()
    await expect(search).toBeFocused()

    await page.keyboard.type(SPLIT_VIEW_KEY)

    await expect(search).toHaveValue(SPLIT_VIEW_KEY)
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('closes on Escape', async ({ page }) => {
    const palette = await openPalette(page)

    await page.keyboard.press('Escape')

    await expect(palette).toBeHidden()
  })

  test('a key pressed after focus has been moved out of the search field does not reach the editor', async ({
    page,
  }) => {
    const palette = await openPalette(page)
    // Park focus on the dialog's container, where the editor would otherwise act on a key.
    await palette.evaluate((container) => container.focus())
    await expect(palette).toBeFocused()

    await page.keyboard.press(SPLIT_VIEW_KEY)

    await expect(palette).toBeVisible()
    await expect(splitViewButton(page)).toHaveAttribute('aria-pressed', 'false')
  })
})
