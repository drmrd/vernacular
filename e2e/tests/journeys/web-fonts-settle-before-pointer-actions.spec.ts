import { test, expect, type Page } from '@playwright/test'

import { gotoEditor, webFontsSettled } from './support'

// How long the editor navigation gets to return while a font file is held back.
const HOLD_CHECK_MS = 1000

// How long the wait gets in the test of the stalled font host. It is short, because the
// face is held for the whole test.
const SHORT_WAIT_LIMIT_MS = 300

// A stylesheet with one face for the interface font whose file lives on the font
// host. The route below holds that file, so the face stays in the loading state.
const FONT_STYLESHEET = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://fonts.gstatic.com/guard/inter.woff2') format('woff2');
}`

// Serve the font stylesheet locally and hold the font file until the returned
// function is called. The file then arrives as text, which is not a font, so the
// face ends in the error state and the font set still becomes ready.
async function holdOneWebFont(page: Page): Promise<() => void> {
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/fonts\.googleapis\.com/, (route) =>
    route.fulfill({
      contentType: 'text/css',
      body: FONT_STYLESHEET,
    }),
  )
  await page.route(/fonts\.gstatic\.com/, async (route) => {
    await released
    await route.fulfill({
      contentType: 'text/plain',
      body: 'not a font',
    })
  })
  return release
}

function anyFaceLoading(page: Page): Promise<boolean> {
  return page.evaluate(() => [...document.fonts].some((face) => face.status === 'loading'))
}

test('does not return from the editor navigation while a web font is still loading', async ({
  page,
}) => {
  const release = await holdOneWebFont(page)

  const navigation = gotoEditor(page)

  await expect(page.getByLabel('Floor plan')).toBeVisible()
  await expect.poll(() => anyFaceLoading(page), { message: 'a web font face loading' }).toBe(true)

  const outcome = await Promise.race([
    navigation.then(() => 'returned'),
    new Promise((resolve) => setTimeout(() => resolve('still waiting'), HOLD_CHECK_MS)),
  ])
  expect(outcome, 'editor navigation while a web font is loading').toBe('still waiting')

  release()
  await navigation
  expect(await anyFaceLoading(page), 'a web font face still loading after the navigation').toBe(
    false,
  )
})

test('fails with a message naming the font host when a web font stays loading past the limit', async ({
  page,
}) => {
  const release = await holdOneWebFont(page)
  try {
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect.poll(() => anyFaceLoading(page), { message: 'a web font face loading' }).toBe(true)

    await expect(webFontsSettled(page, SHORT_WAIT_LIMIT_MS)).rejects.toThrow(
      /web fonts still loading after \d+ ms: the font host is slow or stalled/,
    )
  } finally {
    release()
  }
})
