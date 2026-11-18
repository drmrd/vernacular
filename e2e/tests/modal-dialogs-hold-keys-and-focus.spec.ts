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
//
// A key typed in a text field proves nothing by the view, because the editor leaves a field's
// own keys alone with or without the dialog. So the tests on the palette's search field read
// the keys that reach a bubble-phase listener on the window instead.

const PALETTE_SHORTCUT = 'ControlOrMeta+k'
const SPLIT_VIEW_KEY = '2'
const CORNER = { x: 5, y: 5 }
const TABS_TO_TRY = 4
const UNBOUND_KEY = 'F9'

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

type RecordedKey = { key: string; defaultPrevented: boolean }

// Records, for every keydown, whether the default was already cancelled when the event
// reached `document` in the capture phase. That runs after the capture listener the
// editor keeps on the window, and the dialog's rule at the body never stops the capture
// phase, so this reads the flag the browser acts on.
async function recordKeydowns(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorded: { key: string; defaultPrevented: boolean }[] = []
    ;(window as unknown as { recordedKeydowns: typeof recorded }).recordedKeydowns = recorded
    document.addEventListener(
      'keydown',
      (event) => recorded.push({ key: event.key, defaultPrevented: event.defaultPrevented }),
      true,
    )
  })
}

async function recordedKeydowns(page: Page, key: string): Promise<RecordedKey[]> {
  const all = await page.evaluate(
    () => (window as unknown as { recordedKeydowns: RecordedKey[] }).recordedKeydowns,
  )
  return all.filter((entry) => entry.key === key)
}

type KeyProbe = { listener: (event: KeyboardEvent) => void; keys: string[] }

// Listens on the window in the bubble phase, where the editor's own shortcut listeners sit,
// and records every key that arrives there. A text field owns its keys in the editor anyway,
// so what the editor does with a key cannot show whether the dialog held it back. This list
// can: it only gains a key that nothing stopped on the way from the focused element.
async function listenForKeysAtWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keys: string[] = []
    const listener = (event: KeyboardEvent) => keys.push(event.key)
    ;(window as unknown as { keyProbe: KeyProbe }).keyProbe = { listener, keys }
    window.addEventListener('keydown', listener)
  })
}

async function keysAtWindow(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { keyProbe: KeyProbe }).keyProbe.keys.slice())
}

async function stopListeningForKeysAtWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { keyProbe: KeyProbe }).keyProbe
    window.removeEventListener('keydown', probe.listener)
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

  test('keeps every key, the one that cancels it included, from the listeners on the window', async ({
    page,
  }) => {
    const { prompt } = await openDiscardPrompt(page)
    await listenForKeysAtWindow(page)

    await page.keyboard.press('a')
    expect(await keysAtWindow(page), 'keys pressed while it is open').toEqual([])

    await page.keyboard.press('Escape')
    await expect(prompt).toBeHidden()
    expect(await keysAtWindow(page), 'keys after the Escape that cancelled it').toEqual([])

    await page.keyboard.press(UNBOUND_KEY)
    expect(await keysAtWindow(page), 'keys after it closed').toEqual([UNBOUND_KEY])

    await stopListeningForKeysAtWindow(page)
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
  test('stays open on a click on its shade and keeps focus in its search field', async ({
    page,
  }) => {
    const palette = await openPalette(page)
    const search = palette.getByRole('textbox', { name: 'Search commands' })

    await page.mouse.click(CORNER.x, CORNER.y)

    await expect(palette).toBeVisible()
    await expect(search).toBeFocused()

    await page.keyboard.type(SPLIT_VIEW_KEY)

    await expect(search).toHaveValue(SPLIT_VIEW_KEY)
  })

  test('keeps every key, the one that closes it included, from the listeners on the window', async ({
    page,
  }) => {
    const palette = await openPalette(page)
    await listenForKeysAtWindow(page)

    await page.keyboard.type('a')
    await page.keyboard.press('ArrowDown')
    expect(await keysAtWindow(page), 'keys typed in the search field').toEqual([])

    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    expect(await keysAtWindow(page), 'keys after the Escape that closed it').toEqual([])

    await page.keyboard.press(UNBOUND_KEY)
    expect(await keysAtWindow(page), 'keys after it closed').toEqual([UNBOUND_KEY])

    await stopListeningForKeysAtWindow(page)
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

test.describe('A chord the editor binds is default-prevented in the browser', () => {
  const SAVE_CHORD = 'ControlOrMeta+s'

  test('with no dialog open, the save chord is prevented and saves', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(page.getByText('Ready')).toBeVisible()
    await recordKeydowns(page)

    await page.keyboard.press(SAVE_CHORD)

    expect(await recordedKeydowns(page, 's')).toEqual([{ key: 's', defaultPrevented: true }])
    await expect(page.getByText('All changes saved')).toBeVisible()
  })

  test.describe('behind the discard prompt', () => {
    test.beforeEach(({ browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')
    })

    test('the save chord is prevented and does not save', async ({ page }) => {
      const { prompt } = await openDiscardPrompt(page)
      await expect(page.getByText('Ready')).toBeVisible()
      await recordKeydowns(page)

      await page.keyboard.press(SAVE_CHORD)

      expect(await recordedKeydowns(page, 's')).toEqual([{ key: 's', defaultPrevented: true }])
      await expect(prompt).toBeVisible()
      await expect(page.getByText('Ready')).toBeVisible()
      await expect(page.getByText('All changes saved')).toHaveCount(0)
    })

    test('a key that nothing binds keeps its default', async ({ page }) => {
      await openDiscardPrompt(page)
      await recordKeydowns(page)

      await page.keyboard.press(UNBOUND_KEY)

      expect(await recordedKeydowns(page, UNBOUND_KEY)).toEqual([
        { key: UNBOUND_KEY, defaultPrevented: false },
      ])
    })
  })
})
